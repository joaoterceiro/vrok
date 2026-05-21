import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    '@zora/db: DATABASE_URL is not set. Add it to your .env or process.env before using the db client.',
  );
}

// Reuse a single connection across HMR / hot reloads in dev.
const globalForDb = globalThis as unknown as {
  __zoraSql?: Sql;
  __zoraDb?: PostgresJsDatabase<typeof schema>;
};

// postgres-js connects lazily on first query, so creating the client here is
// effectively free — even at build time with a stub DATABASE_URL.
const sql =
  globalForDb.__zoraSql ??
  postgres(url, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });

export const db: PostgresJsDatabase<typeof schema> =
  globalForDb.__zoraDb ?? drizzle(sql, { schema, logger: process.env.DRIZZLE_LOG === '1' });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__zoraSql = sql;
  globalForDb.__zoraDb = db;
}

export type Database = PostgresJsDatabase<typeof schema>;
export { schema };
