import { and, eq, sql } from 'drizzle-orm';
import { conversations, teamMembers, users } from '@zora/db';
import { db } from './db';
import { log } from './logger';

/**
 * Picks the agent with the fewest currently-open assigned conversations within
 * a given team. Falls back to any available agent. Returns null if no candidate.
 */
export async function pickRoundRobinAssignee(teamId: string | null): Promise<string | null> {
  if (!teamId) return null;

  const candidates = await db
    .select({
      userId: users.id,
      role: users.role,
      status: users.status,
      isActive: users.isActive,
      openCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${conversations}
        WHERE ${conversations.assigneeId} = ${users.id}
          AND ${conversations.status} IN ('open','pending','snoozed')
      )`,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(sql`open_count ASC, users.last_seen_at DESC NULLS LAST`);

  // Prefer available + active.
  const ranked = candidates
    .filter((c) => c.isActive && c.role !== 'admin') // admins typically don't take queue
    .sort((a, b) => {
      const sa = scoreForStatus(a.status);
      const sb = scoreForStatus(b.status);
      if (sa !== sb) return sb - sa;
      return a.openCount - b.openCount;
    });

  const winner = ranked[0]?.userId ?? null;
  log.debug({ teamId, winner }, 'round-robin pick');
  return winner;
}

function scoreForStatus(s: string): number {
  if (s === 'available') return 2;
  if (s === 'busy') return 1;
  return 0;
}

/**
 * Auto-assign a conversation when it has a team but no assignee. Idempotent —
 * if conversation is already assigned, returns early.
 */
export async function autoAssignIfNeeded(conversationId: string): Promise<string | null> {
  const [c] = await db
    .select({
      id: conversations.id,
      teamId: conversations.teamId,
      assigneeId: conversations.assigneeId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!c || c.assigneeId) return c?.assigneeId ?? null;

  const winner = await pickRoundRobinAssignee(c.teamId);
  if (!winner) return null;

  await db
    .update(conversations)
    .set({ assigneeId: winner, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), sql`${conversations.assigneeId} IS NULL`));

  return winner;
}
