/**
 * History sync — pulls all chats + messages from an Evolution instance into
 * the local database the first time we connect (or on demand). Designed to
 * be idempotent: composite UNIQUE (provider_message_id, conversation_id) on
 * `messages` prevents dupes across re-runs; contacts use `contact_identities`
 * unique on (channel_type, external_id).
 *
 * Progress is published to:
 *   - `channels.sync_progress` jsonb (persisted)
 *   - socket room `all` with event `channel:sync-progress` (live UI)
 *
 * Why iterate contacts → messages instead of just listing messages: Evolution
 * limits `/chat/findMessages` to a single chat; without the contact loop we'd
 * have no way to enumerate the universe of chats.
 */
import type { Job } from 'bullmq';
import { and, eq, sql } from 'drizzle-orm';
import {
  channels,
  contactIdentities,
  contacts,
  conversations,
  messages,
} from '@zora/db';
import {
  evolutionFindChats,
  evolutionFindMessages,
  type EvolutionChatRow,
  type EvolutionMessageRow,
} from '@zora/shared/channels';
import { db } from '../db';
import { log } from '../logger';
import { publishSocketEvent } from '../publish';

const CHATS_PAGE_SIZE = 100;
const MESSAGES_PAGE_SIZE = 100;
const MAX_MESSAGES_PER_CONTACT = 5000; // safety ceiling for huge histories

export interface HistorySyncJobData {
  channelId: string;
  /** Optional: skip contacts that already have N messages (incremental sync). */
  incremental?: boolean;
}

export async function processHistorySync(job: Job<HistorySyncJobData>) {
  const { channelId, incremental } = job.data;

  const [channel] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
  if (!channel) {
    log.warn({ channelId, jobId: job.id }, 'history-sync: channel not found');
    return;
  }
  if (channel.type !== 'wa_evolution') {
    log.warn({ channelId, type: channel.type }, 'history-sync: only Evolution is supported');
    return;
  }

  await markStatus(channelId, 'syncing', {}, { startedAt: new Date(), error: null });
  log.info({ channelId, jobId: job.id, incremental }, 'history-sync started');

  let contactsImported = 0;
  let messagesImported = 0;
  let messagesSkipped = 0;
  const startedAt = Date.now();

  try {
    // 1) Fetch CHATS — these are the real conversations with history
    // (unlike `findContacts` which returns the entire address book and
    // mostly returns `@s.whatsapp.net` JIDs that don't match the modern
    // `@lid` JIDs messages are actually stored under).
    let offset = 0;
    const allChats: EvolutionChatRow[] = [];
    while (true) {
      const batch = await evolutionFindChats(channel.config, {
        skip: offset,
        limit: CHATS_PAGE_SIZE,
      });
      if (batch.length === 0) break;
      allChats.push(...batch);
      offset += batch.length;
      await emitProgress(channelId, {
        contacts: { total: allChats.length, done: 0 },
        messages: { total: 0, done: 0 },
      });
      if (batch.length < CHATS_PAGE_SIZE) break;
    }

    log.info({ channelId, totalChats: allChats.length }, 'history-sync: chats collected');

    // 2) For each chat, paginate messages and upsert
    for (let i = 0; i < allChats.length; i++) {
      const c = allChats[i]!;

      // Probe the FIRST page of messages BEFORE creating contact/conversation.
      // Even though `findChats` only returns chats with activity, the message
      // table may be empty if Baileys hasn't cached this chat's messages yet.
      const firstPage = await evolutionFindMessages(channel.config, c.remoteJid, {
        page: 1,
        limit: MESSAGES_PAGE_SIZE,
      });
      if (firstPage.rows.length === 0) {
        continue;
      }

      const contactId = await upsertContactRow(channel.type, c);

      if (incremental) {
        const [{ existing }] = await db.execute<{ existing: number }>(sql`
          SELECT COUNT(*)::int AS existing
          FROM ${messages} m
          JOIN ${conversations} cv ON cv.id = m.conversation_id
          WHERE cv.channel_id = ${channelId} AND cv.contact_id = ${contactId}
        `).then((r) => (r as unknown as { rows: Array<{ existing: number }> }).rows ?? [{ existing: 0 }]);
        if (existing > 50) {
          // Skip well-populated chats in incremental mode
          contactsImported++;
          continue;
        }
      }

      const conversationId = await upsertConversationFor(channelId, channel.defaultTeamId, contactId);

      let page = 1;
      let totalForContact = firstPage.total ?? 0;
      let importedForContact = 0;
      let consecutiveEmpty = 0;
      let usePrefetched: typeof firstPage | null = firstPage;

      while (importedForContact < MAX_MESSAGES_PER_CONTACT) {
        const { rows, total } =
          usePrefetched ??
          (await evolutionFindMessages(channel.config, c.remoteJid, {
            page,
            limit: MESSAGES_PAGE_SIZE,
          }));
        usePrefetched = null;
        if (page === 1 && total) totalForContact = total;
        if (rows.length === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) break;
          page++;
          continue;
        }

        for (const m of rows) {
          const inserted = await persistHistoricalMessage(conversationId, m);
          if (inserted) {
            messagesImported++;
            importedForContact++;
          } else {
            messagesSkipped++;
          }
        }

        await emitProgress(channelId, {
          contacts: { total: allChats.length, done: i + 1 },
          messages: { total: messagesImported + messagesSkipped, done: messagesImported },
          currentContact: c.pushName ?? c.remoteJid,
        });

        if (rows.length < MESSAGES_PAGE_SIZE) break;
        page++;
      }

      // Update conversation summary using latest historical message so the
      // list view shows a preview instead of "Sem mensagens ainda".
      if (importedForContact > 0) {
        await db.execute(sql`
          UPDATE conversations cv
          SET
            imported_at  = COALESCE(cv.imported_at, NOW()),
            last_synced_at = NOW(),
            last_message_at = COALESCE(latest.created_at, cv.last_message_at),
            last_message_preview = COALESCE(
              LEFT(NULLIF(TRIM(latest.body), ''), 280),
              CASE latest.content_type
                WHEN 'image' THEN '📷 Imagem'
                WHEN 'audio' THEN '🎙️ Áudio'
                WHEN 'video' THEN '🎬 Vídeo'
                WHEN 'document' THEN '📎 Documento'
                WHEN 'sticker' THEN '🌟 Sticker'
                WHEN 'location' THEN '📍 Localização'
                ELSE cv.last_message_preview
              END
            ),
            updated_at = NOW()
          FROM (
            SELECT body, content_type, created_at
            FROM messages
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at DESC
            LIMIT 1
          ) latest
          WHERE cv.id = ${conversationId}
        `);
      }

      contactsImported++;
      if ((i + 1) % 10 === 0) {
        log.debug(
          { channelId, contactsImported, messagesImported, messagesSkipped },
          'history-sync progress',
        );
      }
    }

    const tookSec = Math.round((Date.now() - startedAt) / 1000);
    await markStatus(channelId, 'done', {
      contacts: { total: allChats.length, done: contactsImported },
      messages: { total: messagesImported + messagesSkipped, done: messagesImported },
    }, { completedAt: new Date(), error: null });

    log.info(
      {
        channelId,
        jobId: job.id,
        contactsImported,
        messagesImported,
        messagesSkipped,
        tookSec,
      },
      'history-sync completed',
    );
  } catch (err) {
    const msg = (err as Error).message;
    log.error({ channelId, err: msg }, 'history-sync failed');
    await markStatus(channelId, 'error', undefined, { error: msg });
    throw err;
  }
}

// ---- DB helpers --------------------------------------------------

async function upsertContactRow(
  channelType: typeof channels.$inferSelect.type,
  c: EvolutionChatRow,
): Promise<string> {
  // The chat's remoteJid is the canonical identifier (often `@lid`). Use it
  // as the external_id so future messages match the same contact. Phone only
  // gets set when we have the real `@s.whatsapp.net` JID — `@lid` digits are
  // an internal WhatsApp identifier, NOT a phone number.
  const externalId = c.remoteJid;
  const phoneDigits = c.phoneJid
    ? (c.phoneJid.split('@')[0] ?? '').replace(/\D/g, '')
    : '';
  const phone = phoneDigits ? `+${phoneDigits}` : null;
  // Display name fallback ladder:
  //   1. The chat's pushName (best signal)
  //   2. The phone number when we have it
  //   3. A short opaque-id tag — keeps rows visually distinct so the user
  //      doesn't see a wall of identical "Sem nome" entries.
  const lidTag = c.remoteJid.includes('@')
    ? `Contato …${c.remoteJid.split('@')[0]!.slice(-4)}`
    : null;
  const displayName = c.pushName?.trim() || phone || lidTag;

  const existing = await db
    .select({ contactId: contactIdentities.contactId })
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.channelType, channelType),
        eq(contactIdentities.externalId, externalId),
      ),
    )
    .limit(1);

  if (existing[0]?.contactId) {
    // Refresh name/avatar/phone from the chat row.
    await db
      .update(contacts)
      .set({
        name: displayName ?? sql`${contacts.name}`,
        avatarUrl: c.profilePicUrl ?? sql`${contacts.avatarUrl}`,
        phone: phone ?? sql`${contacts.phone}`,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, existing[0].contactId));
    return existing[0].contactId;
  }

  const [created] = await db
    .insert(contacts)
    .values({
      name: displayName,
      avatarUrl: c.profilePicUrl ?? null,
      phone,
    })
    .returning({ id: contacts.id });
  if (!created) throw new Error('Failed to create contact during history-sync');

  await db.insert(contactIdentities).values({
    contactId: created.id,
    channelType,
    externalId,
  });
  return created.id;
}

async function upsertConversationFor(
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
        sql`${conversations.status} IN ('open','pending','snoozed','resolved')`,
      ),
    )
    .orderBy(sql`${conversations.lastMessageAt} DESC NULLS LAST`)
    .limit(1);
  if (open[0]?.id) return open[0].id;

  const [created] = await db
    .insert(conversations)
    .values({
      channelId,
      contactId,
      teamId: defaultTeamId,
      // Historical chats default to 'resolved' so they don't flood the live
      // inbox queue. The operator can re-open if needed.
      status: 'resolved',
      importedAt: new Date(),
      lastSyncedAt: new Date(),
    })
    .returning({ id: conversations.id });
  return created!.id;
}

async function persistHistoricalMessage(
  conversationId: string,
  m: EvolutionMessageRow,
): Promise<boolean> {
  // contentType maps to schema enum subset
  const contentType: typeof messages.$inferInsert.contentType =
    m.contentType === 'unknown' ? 'text' : (m.contentType as typeof messages.$inferInsert.contentType);

  const inserted = await db
    .insert(messages)
    .values({
      conversationId,
      providerMessageId: m.providerMessageId,
      direction: m.fromMe ? 'out' : 'in',
      sender: m.fromMe ? 'user' : 'contact',
      contentType,
      body: m.body,
      attachments: [],
      status: m.fromMe ? 'sent' : 'delivered',
      sentAt: m.fromMe ? m.timestamp : null,
      deliveredAt: !m.fromMe ? m.timestamp : null,
      isHistorical: true,
      createdAt: m.timestamp,
    })
    .onConflictDoNothing({
      target: [messages.providerMessageId, messages.conversationId],
    })
    .returning({ id: messages.id });

  return inserted.length > 0;
}

// ---- Status / progress -------------------------------------------

async function markStatus(
  channelId: string,
  status: 'idle' | 'queued' | 'syncing' | 'done' | 'error',
  progress?: Record<string, unknown>,
  extra: { startedAt?: Date; completedAt?: Date; error?: string | null } = {},
): Promise<void> {
  const patch: Record<string, unknown> = { syncStatus: status, updatedAt: new Date() };
  if (progress) patch.syncProgress = progress;
  if (extra.startedAt) patch.syncStartedAt = extra.startedAt;
  if (extra.completedAt) patch.syncCompletedAt = extra.completedAt;
  if (extra.error !== undefined) patch.syncError = extra.error;
  await db
    .update(channels)
    .set(patch as never)
    .where(eq(channels.id, channelId));
}

async function emitProgress(
  channelId: string,
  progress: {
    contacts: { total: number; done: number };
    messages: { total: number; done: number };
    currentContact?: string;
  },
): Promise<void> {
  await db
    .update(channels)
    .set({ syncProgress: progress, updatedAt: new Date() })
    .where(eq(channels.id, channelId));
  await publishSocketEvent({
    room: 'all',
    event: 'channel:sync-progress',
    data: { channelId, ...progress },
  });
}
