import { pgTable, uuid, varchar, jsonb, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { channelStatus, channelType } from './enums';
import { teams } from './teams';

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: channelType('type').notNull(),
    name: varchar('name', { length: 120 }).notNull(),
    /** Encrypted (AES-GCM) configuration: tokens, instance name, phone numbers, etc. */
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
    status: channelStatus('status').notNull().default('disconnected'),
    defaultTeamId: uuid('default_team_id').references(() => teams.id, { onDelete: 'set null' }),
    lastConnectedAt: timestamp('last_connected_at', { withTimezone: true }),
    // ---- History sync state (Phase 8) -----------------------------
    /** idle | queued | syncing | done | error */
    syncStatus: varchar('sync_status', { length: 16 }).notNull().default('idle'),
    /** { contacts: { total, done }, messages: { total, done } } */
    syncProgress: jsonb('sync_progress').$type<{
      contacts?: { total: number; done: number };
      messages?: { total: number; done: number };
      currentContact?: string;
    }>().notNull().default({}),
    syncStartedAt: timestamp('sync_started_at', { withTimezone: true }),
    syncCompletedAt: timestamp('sync_completed_at', { withTimezone: true }),
    syncError: text('sync_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    typeIdx: index('channels_type_idx').on(t.type),
  }),
);

export const channelsRelations = relations(channels, ({ one }) => ({
  defaultTeam: one(teams, { fields: [channels.defaultTeamId], references: [teams.id] }),
}));
