import { pgTable, uuid, varchar, integer, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * SLA rules — applied at conversation creation time. The first matching rule
 * (highest priority) sets `conversation.sla_due_at`.
 */
export const slaRules = pgTable('sla_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 120 }).notNull(),
  /** Higher = applied first. */
  priority: integer('priority').notNull().default(0),
  /** Conditions to match (jsonb): { channelType?, teamId?, priority? } */
  match: jsonb('match').$type<Record<string, unknown>>().notNull().default({}),
  /** Minutes until first response should happen. */
  firstResponseMinutes: integer('first_response_minutes').notNull().default(30),
  /** Minutes until conversation should be resolved. */
  resolutionMinutes: integer('resolution_minutes').notNull().default(1440),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
});
