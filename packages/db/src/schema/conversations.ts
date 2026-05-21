import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  conversationPriority,
  conversationStatus,
  messageContentType,
  messageDirection,
  messageSender,
  messageStatus,
} from './enums';
import { contacts } from './contacts';
import { channels } from './channels';
import { teams } from './teams';
import { users } from './auth';

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    status: conversationStatus('status').notNull().default('open'),
    priority: conversationPriority('priority').notNull().default('normal'),
    subject: varchar('subject', { length: 255 }),
    unreadCount: integer('unread_count').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastMessagePreview: text('last_message_preview'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    // History sync state (Phase 8) — populated when imported from a provider
    // backlog (Evolution) instead of live webhook traffic.
    importedAt: timestamp('imported_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    /**
     * Phase 10 — per-conversation AI agent override. NULL = use channel
     * assignment / org default. When set, this exact agent answers.
     */
    agentId: uuid('agent_id'),
    /**
     * Phase 10 — when set, all bots are paused for this conversation until
     * an explicit resume via the header dropdown.
     */
    botPausedAt: timestamp('bot_paused_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index('conversations_status_idx').on(t.status, t.teamId, t.assigneeId),
    contactIdx: index('conversations_contact_idx').on(t.contactId),
    lastMessageIdx: index('conversations_last_message_idx').on(t.lastMessageAt),
  }),
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    providerMessageId: varchar('provider_message_id', { length: 255 }),
    direction: messageDirection('direction').notNull(),
    sender: messageSender('sender').notNull(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    contentType: messageContentType('content_type').notNull().default('text'),
    body: text('body'),
    attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    status: messageStatus('status').notNull().default('queued'),
    error: text('error'),
    repliedToId: uuid('replied_to_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    /** True for messages imported from a provider backlog (history sync). */
    isHistorical: boolean('is_historical').notNull().default(false),
    /** When the customer read THIS outbound message on their device. */
    readByContactAt: timestamp('read_by_contact_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    convoIdx: index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    // Composite unique — same provider_message_id from DIFFERENT channels is
    // allowed; duplicates within the same conversation are not. Protects
    // against webhook re-delivery races and lets multi-instance setups coexist.
    providerUq: uniqueIndex('messages_provider_conv_uq').on(
      t.providerMessageId,
      t.conversationId,
    ),
    statusIdx: index('messages_status_idx').on(t.status),
  }),
);

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    minioKey: text('minio_key').notNull(),
    mime: varchar('mime', { length: 128 }).notNull(),
    size: integer('size'),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    thumbnailKey: text('thumbnail_key'),
    originalFilename: varchar('original_filename', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    messageIdx: index('attachments_message_idx').on(t.messageId),
  }),
);

export const notes = pgTable('notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  contact: one(contacts, { fields: [conversations.contactId], references: [contacts.id] }),
  channel: one(channels, { fields: [conversations.channelId], references: [channels.id] }),
  team: one(teams, { fields: [conversations.teamId], references: [teams.id] }),
  assignee: one(users, { fields: [conversations.assigneeId], references: [users.id] }),
  messages: many(messages),
  notes: many(notes),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  user: one(users, { fields: [messages.userId], references: [users.id] }),
  attachmentRows: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  message: one(messages, { fields: [attachments.messageId], references: [messages.id] }),
}));
