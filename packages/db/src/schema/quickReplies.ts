import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { teams } from './teams';

export const quickReplies = pgTable(
  'quick_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    shortcut: varchar('shortcut', { length: 64 }).notNull(),
    body: text('body').notNull(),
    attachments: jsonb('attachments').$type<unknown[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    shortcutIdx: index('quick_replies_shortcut_idx').on(t.shortcut),
  }),
);
