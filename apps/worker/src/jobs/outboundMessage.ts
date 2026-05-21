import type { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import {
  channels,
  contactIdentities,
  conversations,
  contacts,
  messages,
  events,
} from '@zora/db';
import { getAdapter } from '@zora/shared/channels';
import type { OutboundPayload, ChannelType } from '@zora/shared';
import { db } from '../db';
import { log } from '../logger';
import { publishSocketEvent } from '../publish';
import { presignedGetUrl } from '../minio';

export interface OutboundJobData {
  messageId: string;
}

export async function processOutbound(job: Job<OutboundJobData>) {
  const { messageId } = job.data;

  const [row] = await db
    .select({
      message: messages,
      conversation: conversations,
      channel: channels,
      contact: contacts,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!row) {
    log.warn({ messageId }, 'outbound: message not found');
    return;
  }
  const { message: m, conversation: c, channel: ch, contact: ct } = row;

  if (m.status !== 'queued') {
    log.debug({ messageId, status: m.status }, 'outbound: skip (not queued)');
    return;
  }
  if (m.direction !== 'out') {
    log.warn({ messageId }, 'outbound: direction mismatch');
    return;
  }

  const adapter = getAdapter(ch.type);
  const dest = await resolveDestination(ch.type, c.contactId, ct);
  if (!dest) {
    await markFailed(m.id, c.id, 'Contato sem endereço destino para o canal');
    return;
  }

  const payload: OutboundPayload = await buildOutboundPayload(m, dest);

  try {
    const result = await adapter.sendMessage(ch.config, payload);
    await db
      .update(messages)
      .set({
        providerMessageId: result.providerMessageId,
        status: 'sent',
        sentAt: new Date(),
      })
      .where(eq(messages.id, m.id));

    await publishSocketEvent({
      room: `conversation:${c.id}`,
      event: 'message:status',
      data: { conversationId: c.id, messageId: m.id, status: 'sent' },
    });

    // Webchat: deliver the outbound message to the visitor's widget room so
    // their browser receives it instantly via Socket.IO.
    if (ch.type === 'webchat') {
      await publishSocketEvent({
        room: `webchat:${ch.id}:${dest}`,
        event: 'message:new',
        data: {
          conversationId: c.id,
          messageId: m.id,
          direction: 'out',
          body: m.body ?? '',
          contentType: m.contentType,
          createdAt: (m.createdAt ?? new Date()).toISOString(),
        },
      });
    }

    log.info({ messageId: m.id, providerMessageId: result.providerMessageId }, 'outbound sent');
  } catch (err) {
    await markFailed(m.id, c.id, (err as Error).message);
    throw err;
  }
}

/**
 * Resolve the destination address for a given channel type:
 *   - wa_evolution / wa_cloud → contact.phone
 *   - instagram → contact_identities.external_id (IGSID)
 *   - telegram → contact_identities.external_id (chat id)
 *   - webchat → contact_identities.external_id (visitor id)
 *   - email → contact.email
 */
async function resolveDestination(
  channelType: ChannelType,
  contactId: string,
  ct: typeof contacts.$inferSelect,
): Promise<string | null> {
  if (channelType === 'email') return ct.email ?? null;
  if (channelType === 'wa_evolution' || channelType === 'wa_cloud') {
    return ct.phone ?? null;
  }
  // Fall back to contact_identities for channels that don't use phone/email.
  const [ident] = await db
    .select({ externalId: contactIdentities.externalId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.contactId, contactId),
        eq(contactIdentities.channelType, channelType),
      ),
    )
    .limit(1);
  return ident?.externalId ?? null;
}

async function buildOutboundPayload(
  m: typeof messages.$inferSelect,
  to: string,
): Promise<OutboundPayload> {
  if (m.contentType === 'text') {
    return { to, content: { type: 'text', text: m.body ?? '' }, clientRef: m.id };
  }
  const att = (
    m.attachments as Array<{
      url: string;
      minioKey?: string;
      mime: string;
      filename?: string;
    }>
  )[0];
  if (att) {
    return {
      to,
      clientRef: m.id,
      content: {
        type: 'media',
        mediaType: contentTypeToMedia(m.contentType),
        url: await providerReachableUrl(att),
        mime: att.mime,
        filename: att.filename,
        caption: m.body ?? undefined,
      },
    };
  }
  return { to, content: { type: 'text', text: m.body ?? '' }, clientRef: m.id };
}

/**
 * Build a URL providers (Evolution, WA Cloud) can GET without our auth.
 *   - Prefer presigned MinIO URL (bucket stays private; URL valid for 1 h).
 *   - Pass through already-absolute URLs unchanged.
 *   - Fall back to the app proxy for legacy attachments without minioKey.
 */
async function providerReachableUrl(att: {
  url: string;
  minioKey?: string;
}): Promise<string> {
  if (att.minioKey) {
    return presignedGetUrl(att.minioKey, 60 * 60);
  }
  if (/^https?:\/\//i.test(att.url)) return att.url;
  const base = (
    process.env.INTERNAL_APP_URL ?? process.env.APP_URL ?? 'http://app:3000'
  ).replace(/\/+$/, '');
  return `${base}${att.url.startsWith('/') ? '' : '/'}${att.url}`;
}

function contentTypeToMedia(t: string): 'image' | 'audio' | 'video' | 'document' | 'sticker' {
  if (t === 'image' || t === 'audio' || t === 'video' || t === 'document' || t === 'sticker') return t;
  return 'document';
}

async function markFailed(messageId: string, conversationId: string, error: string) {
  await db
    .update(messages)
    .set({ status: 'failed', error })
    .where(eq(messages.id, messageId));
  await db.insert(events).values({
    type: 'message.failed',
    conversationId,
    payload: { messageId, error },
  });
  await publishSocketEvent({
    room: `conversation:${conversationId}`,
    event: 'message:status',
    data: { conversationId, messageId, status: 'failed' },
  });
  log.warn({ messageId, error }, 'outbound failed');
}
