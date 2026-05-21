import { and, asc, eq, sql } from 'drizzle-orm';
import { conversations, slaRules } from '@zora/db';
import { db } from './db';

interface MatchCtx {
  channelType?: string;
  teamId?: string | null;
  priority?: string;
}

/** Picks the first matching SLA rule and sets `sla_due_at` accordingly. */
export async function applySlaToConversation(conversationId: string, ctx: MatchCtx): Promise<void> {
  const rules = await db
    .select()
    .from(slaRules)
    .where(eq(slaRules.isActive, true))
    .orderBy(sql`${slaRules.priority} DESC`);

  for (const r of rules) {
    if (matches(r.match as Record<string, unknown>, ctx)) {
      const due = new Date(Date.now() + r.firstResponseMinutes * 60_000);
      await db
        .update(conversations)
        .set({ slaDueAt: due, updatedAt: new Date() })
        .where(and(eq(conversations.id, conversationId), sql`${conversations.slaDueAt} IS NULL`));
      return;
    }
  }
}

function matches(rule: Record<string, unknown>, ctx: MatchCtx): boolean {
  if (rule.channelType && rule.channelType !== ctx.channelType) return false;
  if (rule.teamId && rule.teamId !== ctx.teamId) return false;
  if (rule.priority && rule.priority !== ctx.priority) return false;
  return true;
}
