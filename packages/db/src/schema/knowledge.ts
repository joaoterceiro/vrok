import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './auth';

/**
 * Knowledge Base — curated articles the AI agents can cite via the
 * `search_kb` tool. Plain text + tags now; embeddings can be added later
 * without breaking the search (we use Postgres FTS as the default index).
 *
 * Schema designed for full-text search: `body` and `title` get a tsvector
 * GIN index attached via raw SQL after creation (see migrations).
 */
export const kbArticles = pgTable(
  'kb_articles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 255 }).notNull(),
    /** Short summary used as the snippet in agent answers. */
    summary: text('summary'),
    body: text('body').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    isPublished: boolean('is_published').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    publishedIdx: index('kb_articles_published_idx').on(t.isPublished, t.updatedAt),
  }),
);
