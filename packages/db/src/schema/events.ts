import { pgTable, uuid, varchar, jsonb, timestamp, index, integer } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { conversations } from './conversations';
import { users } from './auth';
import { teams } from './teams';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: varchar('type', { length: 64 }).notNull(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    typeIdx: index('events_type_idx').on(t.type, t.createdAt),
    convoIdx: index('events_conversation_idx').on(t.conversationId, t.createdAt),
  }),
);

export const metricsSnapshots = pgTable(
  'metrics_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: varchar('period', { length: 24 }).notNull(), // YYYY-MM-DD or YYYY-MM-DDTHH
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    conversationsOpened: integer('conversations_opened').notNull().default(0),
    conversationsClosed: integer('conversations_closed').notNull().default(0),
    messagesIn: integer('messages_in').notNull().default(0),
    messagesOut: integer('messages_out').notNull().default(0),
    /** Tempo médio de atendimento em segundos */
    tmaSeconds: integer('tma_seconds'),
    /** Tempo médio de espera em segundos */
    tmeSeconds: integer('tme_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    periodIdx: index('metrics_snapshots_period_idx').on(t.period),
  }),
);
