// Re-export of the shared Drizzle client. Worker has its own postgres pool.
export { db, schema } from '@zora/db';
export * from '@zora/db';
