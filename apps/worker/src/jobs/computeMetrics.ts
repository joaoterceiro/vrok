import type { Job } from 'bullmq';
import { sql } from 'drizzle-orm';
import { conversations, messages, metricsSnapshots } from '@zora/db';
import { db } from '../db';
import { log } from '../logger';

/**
 * Hourly snapshot aggregator. Computes per-day per-team per-user counters and
 * upserts into `metrics_snapshots`. Runs idempotently — same period can be
 * recomputed safely.
 */
export async function processMetrics(_job: Job) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Aggregate by team + by user for today.
  const rows = await db.execute<{ team_id: string | null; user_id: string | null; opened: number; closed: number; in_count: number; out_count: number; tma: number | null; tme: number | null }>(sql`
    WITH today_msgs AS (
      SELECT m.*, c.team_id, c.assignee_id
      FROM ${messages} m
      JOIN ${conversations} c ON c.id = m.conversation_id
      WHERE m.created_at >= date_trunc('day', now())
    )
    SELECT
      c.team_id,
      c.assignee_id AS user_id,
      COUNT(*) FILTER (WHERE c.created_at >= date_trunc('day', now())) AS opened,
      COUNT(*) FILTER (WHERE c.resolved_at >= date_trunc('day', now())) AS closed,
      (SELECT COUNT(*) FROM today_msgs t WHERE t.direction = 'in' AND COALESCE(t.team_id, '00000000-0000-0000-0000-000000000000') = COALESCE(c.team_id, '00000000-0000-0000-0000-000000000000') AND COALESCE(t.assignee_id, '00000000-0000-0000-0000-000000000000') = COALESCE(c.assignee_id, '00000000-0000-0000-0000-000000000000')) AS in_count,
      (SELECT COUNT(*) FROM today_msgs t WHERE t.direction = 'out' AND COALESCE(t.team_id, '00000000-0000-0000-0000-000000000000') = COALESCE(c.team_id, '00000000-0000-0000-0000-000000000000') AND COALESCE(t.assignee_id, '00000000-0000-0000-0000-000000000000') = COALESCE(c.assignee_id, '00000000-0000-0000-0000-000000000000')) AS out_count,
      EXTRACT(EPOCH FROM AVG(c.resolved_at - c.created_at))::int AS tma,
      NULL::int AS tme
    FROM ${conversations} c
    WHERE c.created_at >= date_trunc('day', now()) - interval '1 day'
    GROUP BY c.team_id, c.assignee_id
  `);

  let upserts = 0;
  for (const r of (rows as unknown as { rows: Array<{ team_id: string | null; user_id: string | null; opened: number; closed: number; in_count: number; out_count: number; tma: number | null }> }).rows ?? []) {
    await db
      .insert(metricsSnapshots)
      .values({
        period: today,
        teamId: r.team_id,
        userId: r.user_id,
        conversationsOpened: Number(r.opened ?? 0),
        conversationsClosed: Number(r.closed ?? 0),
        messagesIn: Number(r.in_count ?? 0),
        messagesOut: Number(r.out_count ?? 0),
        tmaSeconds: r.tma ?? null,
      })
      .onConflictDoNothing();
    upserts++;
  }
  log.info({ period: today, upserts }, 'metrics aggregated');
}
