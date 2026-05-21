import { NextResponse, type NextRequest } from 'next/server';
import { and, gte, lte, sql } from 'drizzle-orm';
import {
  db,
  channels,
  conversations,
  messages,
  campaigns,
  campaignMessages,
  optOuts,
  users,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Returns a dashboard payload: KPIs + breakdowns + 14-day volume series. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? 14)));
  const since = sql`now() - (${days}::int * interval '1 day')`;

  const [totals] = (await db.execute<{
    open_count: number;
    pending_count: number;
    resolved_count: number;
    overdue_sla: number;
    in_msgs: number;
    out_msgs: number;
    avg_tma_sec: number | null;
    contacts_count: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM ${conversations} WHERE status='open') AS open_count,
      (SELECT COUNT(*)::int FROM ${conversations} WHERE status='pending') AS pending_count,
      (SELECT COUNT(*)::int FROM ${conversations} WHERE status='resolved' AND resolved_at >= ${since}) AS resolved_count,
      (SELECT COUNT(*)::int FROM ${conversations} WHERE sla_due_at IS NOT NULL AND sla_due_at < now() AND status IN ('open','pending')) AS overdue_sla,
      (SELECT COUNT(*)::int FROM ${messages} WHERE direction='in' AND created_at >= ${since}) AS in_msgs,
      (SELECT COUNT(*)::int FROM ${messages} WHERE direction='out' AND created_at >= ${since}) AS out_msgs,
      (SELECT EXTRACT(EPOCH FROM AVG(resolved_at - created_at))::int FROM ${conversations} WHERE resolved_at IS NOT NULL AND resolved_at >= ${since}) AS avg_tma_sec,
      (SELECT COUNT(DISTINCT contact_id)::int FROM ${conversations} WHERE created_at >= ${since}) AS contacts_count
  `)) as unknown as Array<{
    open_count: number;
    pending_count: number;
    resolved_count: number;
    overdue_sla: number;
    in_msgs: number;
    out_msgs: number;
    avg_tma_sec: number | null;
    contacts_count: number;
  }>;

  const byDay = (await db.execute<{ day: string; in_count: number; out_count: number }>(sql`
    SELECT to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE m.direction='in')::int AS in_count,
           COUNT(*) FILTER (WHERE m.direction='out')::int AS out_count
    FROM ${messages} m
    WHERE m.created_at >= ${since}
    GROUP BY day ORDER BY day ASC
  `)) as unknown as Array<{ day: string; in_count: number; out_count: number }>;

  const byChannel = (await db.execute<{ name: string; type: string; total: number; in_count: number; out_count: number }>(sql`
    SELECT ch.name, ch.type::text AS type,
           COUNT(m.id)::int AS total,
           COUNT(m.id) FILTER (WHERE m.direction='in')::int AS in_count,
           COUNT(m.id) FILTER (WHERE m.direction='out')::int AS out_count
    FROM ${channels} ch
    LEFT JOIN ${conversations} c ON c.channel_id = ch.id
    LEFT JOIN ${messages} m ON m.conversation_id = c.id AND m.created_at >= ${since}
    GROUP BY ch.id, ch.name, ch.type ORDER BY total DESC
  `)) as unknown as Array<{ name: string; type: string; total: number; in_count: number; out_count: number }>;

  const byAgent = (await db.execute<{
    user_id: string;
    name: string | null;
    email: string;
    assigned: number;
    resolved: number;
    sent: number;
  }>(sql`
    SELECT u.id AS user_id, u.name, u.email,
           COUNT(DISTINCT c.id) FILTER (WHERE c.assignee_id = u.id AND c.created_at >= ${since})::int AS assigned,
           COUNT(DISTINCT c.id) FILTER (WHERE c.resolved_at >= ${since} AND c.assignee_id = u.id)::int AS resolved,
           COUNT(m.id) FILTER (WHERE m.direction='out' AND m.user_id = u.id AND m.created_at >= ${since})::int AS sent
    FROM ${users} u
    LEFT JOIN ${conversations} c ON c.assignee_id = u.id
    LEFT JOIN ${messages} m ON m.user_id = u.id
    WHERE u.is_active = true
    GROUP BY u.id ORDER BY sent DESC LIMIT 20
  `)) as unknown as Array<{
    user_id: string;
    name: string | null;
    email: string;
    assigned: number;
    resolved: number;
    sent: number;
  }>;

  const [campaignStats] = (await db.execute<{
    total_campaigns: number;
    running: number;
    completed: number;
    sent_count: number;
    optouts: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM ${campaigns}) AS total_campaigns,
      (SELECT COUNT(*)::int FROM ${campaigns} WHERE status='running') AS running,
      (SELECT COUNT(*)::int FROM ${campaigns} WHERE status='completed' AND completed_at >= ${since}) AS completed,
      (SELECT COUNT(*)::int FROM ${campaignMessages} WHERE status IN ('sent','delivered','read') AND created_at >= ${since}) AS sent_count,
      (SELECT COUNT(*)::int FROM ${optOuts} WHERE created_at >= ${since}) AS optouts
  `)) as unknown as Array<{
    total_campaigns: number;
    running: number;
    completed: number;
    sent_count: number;
    optouts: number;
  }>;

  return NextResponse.json({
    period: { days },
    totals: totals ?? null,
    byDay,
    byChannel,
    byAgent,
    campaignStats: campaignStats ?? null,
  });
}
