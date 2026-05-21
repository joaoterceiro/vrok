import { pgTable, text, boolean, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

/**
 * Key-value store for application-level configuration that should be editable
 * at runtime (rather than baked into env vars). Used for LLM API keys, default
 * model selection and similar settings that benefit from a UI.
 *
 * Secrets are stored encrypted (AES-GCM) via `encryptString` from
 * `@zora/shared/crypto`. Always set `is_secret=true` for credentials so the
 * read-side API masks the value before returning it.
 */
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  /** Encrypted blob if is_secret, plain text otherwise. */
  value: text('value'),
  isSecret: boolean('is_secret').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
