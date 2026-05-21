import type { Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  campaigns,
  campaignMessages,
  channels,
  contacts,
  conversations,
  contactIdentities,
  messages,
  messageTemplates,
} from '@zora/db';
import { getAdapter } from '@zora/shared/channels';
import type { OutboundPayload, ChannelType } from '@zora/shared';
import { db } from '../db';
import { log } from '../logger';
import { publishSocketEvent } from '../publish';
import { isOptedOut } from '../optouts';

export interface CampaignSendJobData {
  campaignId: string;
  campaignMessageId: string;
}

export async function processCampaignSend(job: Job<CampaignSendJobData>) {
  const { campaignId, campaignMessageId } = job.data;

  const [row] = await db
    .select({
      cm: campaignMessages,
      campaign: campaigns,
      channel: channels,
      template: messageTemplates,
      contact: contacts,
    })
    .from(campaignMessages)
    .innerJoin(campaigns, eq(campaigns.id, campaignMessages.campaignId))
    .innerJoin(channels, eq(channels.id, campaigns.channelId))
    .leftJoin(messageTemplates, eq(messageTemplates.id, campaigns.templateId))
    .innerJoin(contacts, eq(contacts.id, campaignMessages.contactId))
    .where(eq(campaignMessages.id, campaignMessageId))
    .limit(1);

  if (!row) {
    log.warn({ campaignMessageId }, 'campaign-send: not found');
    return;
  }
  const { cm, campaign, channel, template, contact } = row;

  // Skip if campaign was paused/canceled mid-flight.
  if (campaign.status === 'paused' || campaign.status === 'canceled') {
    log.info({ campaignId, status: campaign.status }, 'campaign-send: skip (terminal)');
    return;
  }
  if (cm.status !== 'pending') {
    log.debug({ campaignMessageId, status: cm.status }, 'campaign-send: skip (already processed)');
    return;
  }

  // Opt-out gate.
  const optedOut = await isOptedOut(contact.id, channel.type as ChannelType);
  if (optedOut) {
    await db
      .update(campaignMessages)
      .set({ status: 'opted_out', error: 'contact opted out', attempts: cm.attempts + 1 })
      .where(eq(campaignMessages.id, cm.id));
    await emitProgress(campaignId);
    return;
  }

  // Send window — if the campaign has start/end times configured and "now"
  // is outside them (America/Sao_Paulo), reschedule for the next window
  // opening instead of firing. Keeps the job in `pending` state.
  const offsetMs = nextWindowDelayMs(campaign.sendWindowStart, campaign.sendWindowEnd);
  if (offsetMs > 0) {
    log.debug(
      { campaignId, campaignMessageId, delayMs: offsetMs },
      'campaign-send: outside window, rescheduling',
    );
    await job.moveToDelayed(Date.now() + offsetMs);
    // Stop processing this turn — BullMQ retries when the delay elapses.
    return;
  }

  // Resolve destination.
  const dest = await resolveDestination(channel.type as ChannelType, contact.id, contact);
  if (!dest) {
    await failMessage(cm.id, 'sem endereço destino para o canal', cm.attempts + 1);
    await emitProgress(campaignId);
    return;
  }

  // Render template body with variables.
  if (!template) {
    await failMessage(cm.id, 'template ausente', cm.attempts + 1);
    await emitProgress(campaignId);
    return;
  }
  const variables = renderVariables(template, contact, cm.variablesResolved, campaign.variableMapping ?? {});
  const body = renderTemplate(template.body, variables);
  if (!body) {
    await failMessage(cm.id, 'template renderizado vazio', cm.attempts + 1);
    await emitProgress(campaignId);
    return;
  }

  // Upsert an open conversation for this contact on this channel so replies land in the inbox.
  const conversationId = await upsertConversation(channel.id, channel.defaultTeamId, contact.id);

  // Persist outbound message (linked to campaign).
  const messageId = randomUUID();
  const [persistedMsg] = await db
    .insert(messages)
    .values({
      id: messageId,
      conversationId,
      direction: 'out',
      sender: 'bot',
      contentType: 'text',
      body,
      status: 'queued',
    })
    .returning();
  if (!persistedMsg) {
    await failMessage(cm.id, 'falha ao persistir mensagem', cm.attempts + 1);
    return;
  }

  // Send via adapter.
  const adapter = getAdapter(channel.type as ChannelType);
  const payload: OutboundPayload = template.providerTemplateId
    ? buildTemplatePayload(dest, template, variables)
    : { to: dest, content: { type: 'text', text: body }, clientRef: messageId };

  try {
    const result = await adapter.sendMessage(channel.config, payload);
    await db
      .update(messages)
      .set({ providerMessageId: result.providerMessageId, status: 'sent', sentAt: new Date() })
      .where(eq(messages.id, messageId));
    await db
      .update(campaignMessages)
      .set({
        status: 'sent',
        sentAt: new Date(),
        attempts: cm.attempts + 1,
        messageId,
        conversationId,
      })
      .where(eq(campaignMessages.id, cm.id));
    await db
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        lastMessagePreview: `📣 ${body.slice(0, 200)}`,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));
    log.info({ campaignId, campaignMessageId, messageId }, 'campaign-send sent');
  } catch (err) {
    await failMessage(cm.id, (err as Error).message, cm.attempts + 1);
    await db.update(messages).set({ status: 'failed', error: (err as Error).message }).where(eq(messages.id, messageId));
    throw err;
  } finally {
    await emitProgress(campaignId);
  }

  // Mark campaign complete if no pending messages remain.
  const pending = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(campaignMessages)
    .where(and(eq(campaignMessages.campaignId, campaignId), eq(campaignMessages.status, 'pending')));
  if ((pending[0]?.count ?? 0) === 0) {
    await db
      .update(campaigns)
      .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
      .where(eq(campaigns.id, campaignId));
    await publishSocketEvent({
      room: 'all',
      event: 'campaign:progress',
      data: { campaignId, counters: await tally(campaignId), status: 'completed' },
    });
  }
}

// ----- helpers --------------------------------------------------

async function resolveDestination(
  channelType: ChannelType,
  contactId: string,
  contact: typeof contacts.$inferSelect,
): Promise<string | null> {
  if (channelType === 'email') return contact.email ?? null;
  if (channelType === 'wa_evolution' || channelType === 'wa_cloud') {
    return contact.phone ?? null;
  }
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
  return created!.id;
}

function renderVariables(
  template: typeof messageTemplates.$inferSelect,
  contact: typeof contacts.$inferSelect,
  audienceVars: Record<string, string>,
  mapping: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const declared = template.variables.length > 0 ? template.variables : Object.keys(audienceVars);
  for (const v of declared) {
    const m = mapping[v];
    if (typeof m === 'string' && m.length > 0) {
      out[v] = resolveSource(m, contact, audienceVars);
    } else {
      // Try direct audience var fallback.
      out[v] = audienceVars[v] ?? '';
    }
  }
  return out;
}

function resolveSource(src: string, contact: typeof contacts.$inferSelect, audVars: Record<string, string>): string {
  if (src.startsWith('audience.csv.')) {
    return audVars[src.slice('audience.csv.'.length)] ?? '';
  }
  if (src === 'contact.name') return contact.name ?? '';
  if (src === 'contact.phone') return contact.phone ?? '';
  if (src === 'contact.email') return contact.email ?? '';
  if (src.startsWith('literal:')) return src.slice('literal:'.length);
  return src;
}

function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

function buildTemplatePayload(
  to: string,
  template: typeof messageTemplates.$inferSelect,
  vars: Record<string, string>,
): OutboundPayload {
  return {
    to,
    content: {
      type: 'template',
      templateProviderId: template.providerTemplateId!,
      language: template.language,
      components: [
        {
          type: 'body',
          parameters: (template.variables ?? []).map((v) => ({
            type: 'text',
            text: vars[v] ?? '',
          })),
        },
      ],
    },
  };
}

async function failMessage(id: string, error: string, attempts: number) {
  await db
    .update(campaignMessages)
    .set({ status: 'failed', error, attempts, failedAt: new Date() })
    .where(eq(campaignMessages.id, id));
}

async function tally(campaignId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: campaignMessages.status, count: sql<number>`COUNT(*)::int` })
    .from(campaignMessages)
    .where(eq(campaignMessages.campaignId, campaignId))
    .groupBy(campaignMessages.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count]));
}

async function emitProgress(campaignId: string) {
  const counters = await tally(campaignId);
  await publishSocketEvent({
    room: 'all',
    event: 'campaign:progress',
    data: { campaignId, counters, status: 'running' },
  });
}

/**
 * Returns 0 if the current time is INSIDE the send window (or if the window
 * is not configured), otherwise returns the number of milliseconds until the
 * next window opens. Computes in America/Sao_Paulo to match the operator's
 * mental model — most Vrok deployments are Brazil-based.
 *
 * `start`/`end` are 'HH:MM' strings (24h). Windows can wrap around midnight
 * (e.g. start='22:00', end='06:00').
 */
function nextWindowDelayMs(
  startHHMM: string | null,
  endHHMM: string | null,
): number {
  if (!startHHMM || !endHHMM) return 0;
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  if (start == null || end == null) return 0;

  const now = nowInSP();
  const currentMin = now.hour * 60 + now.minute;
  const inside =
    start === end
      ? false
      : start < end
        ? currentMin >= start && currentMin < end
        : // wrap-around window (e.g. 22:00 → 06:00)
          currentMin >= start || currentMin < end;
  if (inside) return 0;

  const startOfTodaySpUtc = Date.UTC(now.year, now.month - 1, now.day) - now.utcOffsetMs;
  let nextOpenAt = startOfTodaySpUtc + start * 60_000;
  if (nextOpenAt <= Date.now()) nextOpenAt += 24 * 60 * 60_000;
  return Math.max(0, nextOpenAt - Date.now());
}

function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * Fetch the current wall-clock in São Paulo without bringing in a heavy
 * timezone library. Intl gives us the offset for free.
 */
function nowInSP(): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  utcOffsetMs: number;
} {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour === '24' ? '0' : parts.hour);
  const minute = Number(parts.minute);

  // Compute offset by diffing the SP wall-clock against the UTC clock.
  const utcWallMs = Date.UTC(year, month - 1, day, hour, minute);
  const utcOffsetMs = utcWallMs - Date.now() + (Date.now() - Math.trunc(Date.now() / 60_000) * 60_000);
  return { year, month, day, hour, minute, utcOffsetMs };
}
