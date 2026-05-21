import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import type { ChannelType } from '@zora/shared';

/**
 * Resolves a channel by type + a config key/value selector. Used by webhook
 * routes that share a single URL across all channels of the same type and
 * differentiate via a payload field (e.g. WA Cloud uses phoneNumberId).
 */
export async function findChannelByConfigKey(
  type: ChannelType,
  key: string,
  value: string,
): Promise<typeof channels.$inferSelect | null> {
  const rows = await db.select().from(channels).where(eq(channels.type, type));
  return rows.find((c) => ((c.config as Record<string, unknown>)?.[key] ?? '') === value) ?? null;
}

export async function getChannel(id: string): Promise<typeof channels.$inferSelect | null> {
  const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return row ?? null;
}
