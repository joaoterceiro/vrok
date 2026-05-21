import { pgTable, uuid, varchar, text, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const botFlows = pgTable('bot_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  trigger: varchar('trigger', { length: 64 }).notNull().default('new_conversation'),
  isActive: boolean('is_active').notNull().default(false),
  definition: jsonb('definition').$type<Record<string, unknown>>().notNull().default({}),
  llmConfig: jsonb('llm_config').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
