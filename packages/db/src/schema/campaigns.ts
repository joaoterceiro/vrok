import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import {
  audienceSource,
  campaignMessageStatus,
  campaignStatus,
  channelType,
  optOutSource,
  templateCategory,
  templateStatus,
} from './enums';
import { channels } from './channels';
import { contacts } from './contacts';
import { conversations, messages } from './conversations';
import { users } from './auth';

// ---- Templates -----------------------------------------------

export const messageTemplates = pgTable(
  'message_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelType: channelType('channel_type').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    language: varchar('language', { length: 16 }).notNull().default('pt_BR'),
    category: templateCategory('category').notNull().default('utility'),
    headerType: varchar('header_type', { length: 32 }),
    headerContent: jsonb('header_content').$type<Record<string, unknown>>(),
    body: text('body').notNull(),
    footer: text('footer'),
    buttons: jsonb('buttons').$type<unknown[]>().notNull().default([]),
    variables: jsonb('variables').$type<string[]>().notNull().default([]),
    providerTemplateId: varchar('provider_template_id', { length: 255 }),
    status: templateStatus('status').notNull().default('draft'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    nameLangUq: uniqueIndex('message_templates_name_lang_uq').on(t.name, t.language, t.channelType),
  }),
);

// ---- Audiences -----------------------------------------------

export const audiences = pgTable('audiences', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  source: audienceSource('source').notNull().default('manual'),
  filterQuery: jsonb('filter_query').$type<Record<string, unknown>>(),
  contactCount: integer('contact_count').notNull().default(0),
  lastBuiltAt: timestamp('last_built_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});

export const audienceContacts = pgTable(
  'audience_contacts',
  {
    audienceId: uuid('audience_id')
      .notNull()
      .references(() => audiences.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    /** Per-contact CSV variables (col → value) */
    variables: jsonb('variables').$type<Record<string, string>>().notNull().default({}),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.audienceId, t.contactId] }),
    audIdx: index('audience_contacts_audience_idx').on(t.audienceId),
  }),
);

// ---- Campaigns -----------------------------------------------

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'restrict' }),
    templateId: uuid('template_id').references(() => messageTemplates.id, { onDelete: 'restrict' }),
    audienceId: uuid('audience_id').references(() => audiences.id, { onDelete: 'restrict' }),
    /** Mapping of template placeholder → source spec (contact field, audience var, literal) */
    variableMapping: jsonb('variable_mapping').$type<Record<string, unknown>>().notNull().default({}),
    scheduleAt: timestamp('schedule_at', { withTimezone: true }),
    rateLimitPerMin: integer('rate_limit_per_min').notNull().default(20),
    retryPolicy: jsonb('retry_policy').$type<Record<string, unknown>>().notNull().default({}),
    sendWindowStart: varchar('send_window_start', { length: 8 }),
    sendWindowEnd: varchar('send_window_end', { length: 8 }),
    status: campaignStatus('status').notNull().default('draft'),
    totalRecipients: integer('total_recipients').notNull().default(0),
    counters: jsonb('counters')
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    statusIdx: index('campaigns_status_idx').on(t.status),
  }),
);

export const campaignMessages = pgTable(
  'campaign_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'set null' }),
    variablesResolved: jsonb('variables_resolved').$type<Record<string, string>>().notNull().default({}),
    status: campaignMessageStatus('status').notNull().default('pending'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    campaignContactUq: uniqueIndex('campaign_messages_camp_contact_uq').on(t.campaignId, t.contactId),
    statusIdx: index('campaign_messages_status_idx').on(t.campaignId, t.status),
  }),
);

// ---- Opt-outs ------------------------------------------------

export const optOuts = pgTable(
  'opt_outs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    channelType: channelType('channel_type'),
    reason: text('reason'),
    source: optOutSource('source').notNull().default('manual'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    contactChannelUq: uniqueIndex('opt_outs_contact_channel_uq').on(t.contactId, t.channelType),
  }),
);

// ---- Relations -----------------------------------------------

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  channel: one(channels, { fields: [campaigns.channelId], references: [channels.id] }),
  template: one(messageTemplates, {
    fields: [campaigns.templateId],
    references: [messageTemplates.id],
  }),
  audience: one(audiences, { fields: [campaigns.audienceId], references: [audiences.id] }),
  createdBy: one(users, { fields: [campaigns.createdById], references: [users.id] }),
  messages: many(campaignMessages),
}));

export const campaignMessagesRelations = relations(campaignMessages, ({ one }) => ({
  campaign: one(campaigns, { fields: [campaignMessages.campaignId], references: [campaigns.id] }),
  contact: one(contacts, { fields: [campaignMessages.contactId], references: [contacts.id] }),
  conversation: one(conversations, {
    fields: [campaignMessages.conversationId],
    references: [conversations.id],
  }),
  message: one(messages, { fields: [campaignMessages.messageId], references: [messages.id] }),
}));

export const audiencesRelations = relations(audiences, ({ many }) => ({
  contacts: many(audienceContacts),
}));

export const audienceContactsRelations = relations(audienceContacts, ({ one }) => ({
  audience: one(audiences, { fields: [audienceContacts.audienceId], references: [audiences.id] }),
  contact: one(contacts, { fields: [audienceContacts.contactId], references: [contacts.id] }),
}));
