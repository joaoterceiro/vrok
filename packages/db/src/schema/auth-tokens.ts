import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

/**
 * Short-lived tokens for invitation links and password-reset flows.
 *
 * - `kind='invite'` → admin invited a new user; carries `email` + intended
 *   `role`. Consuming the token creates the user row.
 * - `kind='reset'` → existing user requested a password reset; carries
 *   `userId`. Consuming the token rewrites that user's `password_hash`.
 *
 * Tokens are single-use — `consumed_at` is stamped on use and the row is
 * then ignored by lookups.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    /** Random URL-safe token (the value sent in the link). */
    token: varchar('token', { length: 96 }).primaryKey(),
    kind: varchar('kind', { length: 16 }).notNull(), // 'invite' | 'reset'
    /** Reset: the target user. Null for invite (user doesn't exist yet). */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Invite: destination email + role. Null for reset. */
    email: varchar('email', { length: 255 }),
    role: varchar('role', { length: 32 }),
    /** Invite: which team to add to (optional). */
    teamId: uuid('team_id'),
    /** Audit: who created this token. */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** Free-text label shown when the recipient opens the link. */
    note: text('note'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    kindIdx: index('auth_tokens_kind_idx').on(t.kind, t.expiresAt),
    emailIdx: index('auth_tokens_email_idx').on(t.email),
  }),
);
