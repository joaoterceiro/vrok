import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  channels,
  contactIdentities,
  contacts,
  conversations,
  messages,
  attachments,
  events,
  campaignMessages,
} from '@zora/db';
import { getAdapter } from '@zora/shared/channels';
import type { IncomingEvent } from '@zora/shared';
import { db } from '../db';
import { log } from '../logger';
import { uploadStream } from '../minio';
import { publishSocketEvent } from '../publish';
import { autoAssignIfNeeded } from '../assignment';
import { queues } from '../queues';
import { aiAgents, agentAssignments } from '@zora/db';
import { isOptOutKeyword, recordOptOut } from '../optouts';
import { applySlaToConversation } from '../sla';

export interface InboundJobData {
  channelId: string;
  /** Raw webhook body (json) — adapter normalizes downstream. */
  payload: unknown;
}

export async function processInbound(job: Job<InboundJobData>) {
  const { channelId, payload } = job.data;

  const [channel] = await db
    .select()
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1);
  if (!channel) {
    log.warn({ channelId }, 'inbound: channel not found, dropping payload');
    return;
  }

  const adapter = getAdapter(channel.type);
  // Inject channelId hint so adapter.parseWebhook can attach it.
  const enriched = typeof payload === 'object' && payload ? { ...payload, __channelId: channelId } : payload;
  const incoming = adapter.parseWebhook(enriched, channel.config);

  for (const evt of incoming) {
    if (evt.content.type === 'status') {
      await handleStatusUpdate(evt);
    } else {
      await handleIncomingMessage(channel, evt);
    }
  }
}

// ----------------------------------------------------------------

async function handleIncomingMessage(
  channel: typeof channels.$inferSelect,
  evt: IncomingEvent,
) {
  // Idempotency: skip if we've already seen this providerMessageId.
  const existing = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.providerMessageId, evt.providerMessageId))
    .limit(1);
  if (existing.length > 0) {
    log.debug({ providerMessageId: evt.providerMessageId }, 'inbound: duplicate, skipping');
    return;
  }

  // 1) Upsert contact via channel-scoped identity.
  const contactId = await upsertContact(channel.type, evt);

  // 2) Get/create conversation (one open conversation per contact+channel).
  const conversationId = await upsertConversation(channel.id, channel.defaultTeamId, contactId);

  // 3) Build message body + content metadata.
  const { body, contentType, attachmentsList } = await buildMessagePayload(
    channel,
    evt,
  );

  // 4) Persist message.
  const [created] = await db
    .insert(messages)
    .values({
      id: randomUUID(),
      conversationId,
      providerMessageId: evt.providerMessageId,
      direction: 'in',
      sender: 'contact',
      contentType,
      body,
      attachments: attachmentsList.map((a) => ({
        url: a.url,
        mime: a.mime,
        filename: a.filename,
        size: a.size,
      })),
      status: 'delivered',
      sentAt: evt.timestamp,
      deliveredAt: new Date(),
      createdAt: evt.timestamp,
    })
    .returning();
  if (!created) return;

  for (const a of attachmentsList) {
    await db.insert(attachments).values({
      messageId: created.id,
      minioKey: a.minioKey,
      mime: a.mime,
      size: a.size ?? null,
      originalFilename: a.filename ?? null,
    });
  }

  // 5) Touch conversation summary.
  const preview = body ?? attachmentLabel(contentType);
  await db
    .update(conversations)
    .set({
      lastMessageAt: evt.timestamp,
      lastMessagePreview: preview?.slice(0, 280) ?? null,
      unreadCount: sql`${conversations.unreadCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  // 6) Audit event.
  await db.insert(events).values({
    type: 'message.incoming',
    conversationId,
    payload: { messageId: created.id, channelId: channel.id },
  });

  // 7) Realtime broadcast (Socket.IO via Redis backplane).
  await publishSocketEvent({
    room: `conversation:${conversationId}`,
    event: 'message:new',
    data: {
      conversationId,
      messageId: created.id,
      direction: 'in',
      contentType,
      body,
      sender: 'contact',
      createdAt: evt.timestamp.toISOString(),
    },
  });
  await publishSocketEvent({
    room: 'all',
    event: 'conversation:updated',
    data: {
      conversationId,
      fields: {
        lastMessagePreview: preview?.slice(0, 280) ?? '',
        lastMessageAt: evt.timestamp.toISOString(),
      },
    },
  });

  log.info(
    { conversationId, messageId: created.id, contentType, channel: channel.name },
    'inbound message stored',
  );

  // Opt-out detection (LGPD): if the message is just a stop keyword, record
  // the opt-out and stop the bot pipeline for this contact.
  if (contentType === 'text' && body && isOptOutKeyword(body)) {
    await recordOptOut(contactId, channel.type, 'keyword', `Mensagem: "${body.slice(0, 100)}"`);
    await publishSocketEvent({
      room: `conversation:${conversationId}`,
      event: 'conversation:updated',
      data: { conversationId, fields: { optOut: true } },
    });
    return; // do not trigger bot for opt-out messages
  }

  // Schedule agent turn — runAgent re-checks all conditions (paused, assigned,
  // resolved) and resolves the right agent for this channel before replying.
  await enqueueAgentIfApplicable(conversationId, channelId, messageId);
}

async function enqueueAgentIfApplicable(
  conversationId: string,
  channelId: string,
  triggerMessageId: string,
) {
  // Cheap pre-check: is there ANY agent that could possibly answer this
  // channel? Saves a queue round-trip when nothing is configured.
  const [hasChannelAgent] = await db
    .select({ id: aiAgents.id })
    .from(agentAssignments)
    .innerJoin(aiAgents, eq(aiAgents.id, agentAssignments.agentId))
    .where(and(eq(agentAssignments.channelId, channelId), eq(aiAgents.isActive, true)))
    .limit(1);
  if (!hasChannelAgent) {
    const [hasDefault] = await db
      .select({ id: aiAgents.id })
      .from(aiAgents)
      .where(and(eq(aiAgents.isDefault, true), eq(aiAgents.isActive, true)))
      .limit(1);
    if (!hasDefault) return;
  }

  await queues.bot.add(
    'turn',
    { conversationId, triggerMessageId },
    { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 500 },
  );
}

// ----------------------------------------------------------------

async function handleStatusUpdate(evt: IncomingEvent) {
  if (evt.content.type !== 'status') return;
  const { messageId: providerId, status } = evt.content;
  const fields: Partial<typeof messages.$inferInsert> = { status };
  if (status === 'sent') fields.sentAt = new Date();
  if (status === 'delivered') fields.deliveredAt = new Date();
  if (status === 'read') fields.readAt = new Date();

  const [updated] = await db
    .update(messages)
    .set(fields)
    .where(eq(messages.providerMessageId, providerId))
    .returning({ id: messages.id, conversationId: messages.conversationId });

  if (updated) {
    await publishSocketEvent({
      room: `conversation:${updated.conversationId}`,
      event: 'message:status',
      data: { conversationId: updated.conversationId, messageId: updated.id, status },
    });

    // Propagate to campaign_messages if this message was sent by a campaign.
    const cmFields: Record<string, unknown> = { status };
    if (status === 'delivered') cmFields.deliveredAt = new Date();
    if (status === 'read') cmFields.readAt = new Date();
    const [cm] = await db
      .update(campaignMessages)
      .set(cmFields)
      .where(eq(campaignMessages.messageId, updated.id))
      .returning({ id: campaignMessages.id, campaignId: campaignMessages.campaignId });
    if (cm) {
      await publishSocketEvent({
        room: 'all',
        event: 'campaign:progress',
        data: {
          campaignId: cm.campaignId,
          counters: await campaignTally(cm.campaignId),
          status: 'running',
        },
      });
    }
  }
}

async function campaignTally(campaignId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: campaignMessages.status, count: sql<number>`COUNT(*)::int` })
    .from(campaignMessages)
    .where(eq(campaignMessages.campaignId, campaignId))
    .groupBy(campaignMessages.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

// ----------------------------------------------------------------

async function upsertContact(
  channelType: typeof channels.$inferSelect.type,
  evt: IncomingEvent,
): Promise<string> {
  const identity = await db
    .select({ contactId: contactIdentities.contactId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.channelType, channelType),
        eq(contactIdentities.externalId, evt.externalContactId),
      ),
    )
    .limit(1);

  if (identity[0]?.contactId) {
    // Optionally refresh name/avatar from contactProfile.
    if (evt.contactProfile?.name || evt.contactProfile?.avatar) {
      await db
        .update(contacts)
        .set({
          name: evt.contactProfile.name ?? sql`${contacts.name}`,
          avatarUrl: evt.contactProfile.avatar ?? sql`${contacts.avatarUrl}`,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, identity[0].contactId));
    }
    return identity[0].contactId;
  }

  // Create new contact + identity.
  const [created] = await db
    .insert(contacts)
    .values({
      name: evt.contactProfile?.name ?? null,
      avatarUrl: evt.contactProfile?.avatar ?? null,
      phone: evt.contactProfile?.phone ?? evt.externalContactId,
      email: evt.contactProfile?.email ?? null,
    })
    .returning({ id: contacts.id });
  if (!created) throw new Error('Failed to create contact');

  await db.insert(contactIdentities).values({
    contactId: created.id,
    channelType,
    externalId: evt.externalContactId,
  });
  return created.id;
}

async function upsertConversation(
  channelId: string,
  defaultTeamId: string | null,
  contactId: string,
): Promise<string> {
  const open = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.channelId, channelId),
        eq(conversations.contactId, contactId),
        sql`${conversations.status} IN ('open','pending','snoozed')`,
      ),
    )
    .limit(1);
  if (open[0]?.id) return open[0].id;

  const [created] = await db
    .insert(conversations)
    .values({
      channelId,
      contactId,
      teamId: defaultTeamId,
      status: 'open',
    })
    .returning({ id: conversations.id });
  if (!created) throw new Error('Failed to create conversation');

  // Apply SLA rules (sets sla_due_at if a rule matches).
  await applySlaToConversation(created.id, {
    channelType: channelId,
    teamId: defaultTeamId,
    priority: 'normal',
  }).catch(() => undefined);

  // Round-robin assign within the team (if any).
  const assignee = await autoAssignIfNeeded(created.id).catch((err: unknown) => {
    log.warn({ err: (err as Error).message }, 'auto-assign failed');
    return null;
  });

  await publishSocketEvent({
    room: 'all',
    event: 'conversation:new',
    data: { conversationId: created.id, channelId, contactId, assigneeId: assignee },
  });
  if (assignee) {
    await publishSocketEvent({
      room: `user:${assignee}`,
      event: 'conversation:assigned',
      data: { conversationId: created.id, channelId },
    });
  }
  return created.id;
}

// ----------------------------------------------------------------

interface BuiltAttachment {
  url: string;
  minioKey: string;
  mime: string;
  filename?: string;
  size?: number;
}

async function buildMessagePayload(
  channel: typeof channels.$inferSelect,
  evt: IncomingEvent,
): Promise<{
  body: string | null;
  contentType: typeof messages.$inferInsert.contentType;
  attachmentsList: BuiltAttachment[];
}> {
  const c = evt.content;
  if (c.type === 'text') {
    return { body: c.text, contentType: 'text', attachmentsList: [] };
  }
  if (c.type === 'location') {
    return {
      body: `Localização: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`,
      contentType: 'location',
      attachmentsList: [],
    };
  }
  if (c.type === 'media') {
    const att = await ingestMedia(channel, c, evt.providerMessageId);
    return {
      body: c.caption ?? null,
      contentType: c.mediaType as typeof messages.$inferInsert.contentType,
      attachmentsList: att ? [att] : [],
    };
  }
  return { body: null, contentType: 'text', attachmentsList: [] };
}

async function ingestMedia(
  channel: typeof channels.$inferSelect,
  c: Extract<IncomingEvent['content'], { type: 'media' }>,
  fallbackId: string,
): Promise<BuiltAttachment | null> {
  try {
    const adapter = getAdapter(channel.type);
    const dl = await adapter.downloadMedia(channel.config, c.providerMediaId);
    const ext = mimeToExt(dl.mime);
    const key = `incoming/${channel.id}/${fallbackId}.${ext}`;
    // Buffer the stream (Evolution returns base64 → small enough to fit in memory).
    const chunks: Buffer[] = [];
    for await (const chunk of dl.stream as AsyncIterable<Buffer | string>) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const buf = Buffer.concat(chunks);
    const { Readable } = await import('node:stream');
    await uploadStream(key, Readable.from(buf), buf.byteLength, dl.mime);
    return {
      url: `/api/media/${encodeURIComponent(key)}`,
      minioKey: key,
      mime: dl.mime,
      filename: dl.filename ?? c.filename,
      size: buf.byteLength,
    };
  } catch (err) {
    log.error({ err: (err as Error).message }, 'inbound: media ingest failed');
    return null;
  }
}

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.startsWith('image/jpeg')) return 'jpg';
  if (m.startsWith('image/png')) return 'png';
  if (m.startsWith('image/webp')) return 'webp';
  if (m.startsWith('image/gif')) return 'gif';
  if (m.startsWith('audio/ogg')) return 'ogg';
  if (m.startsWith('audio/mpeg')) return 'mp3';
  if (m.startsWith('audio/wav')) return 'wav';
  if (m.startsWith('video/mp4')) return 'mp4';
  if (m.startsWith('application/pdf')) return 'pdf';
  return 'bin';
}

function attachmentLabel(t: string): string {
  switch (t) {
    case 'image':
      return '📷 Imagem';
    case 'audio':
      return '🎤 Áudio';
    case 'video':
      return '🎬 Vídeo';
    case 'document':
      return '📎 Documento';
    case 'sticker':
      return '🎟️ Sticker';
    case 'location':
      return '📍 Localização';
    default:
      return '';
  }
}
