import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, conversations, contacts, channels, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Streams a CSV with one row per conversation in the requested window. */
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(180, Number(url.searchParams.get('days') ?? 30)));
  const since = sql`now() - (${days}::int * interval '1 day')`;

  const rows = (await db.execute<{
    id: string;
    created_at: string;
    resolved_at: string | null;
    status: string;
    channel: string;
    contact_name: string | null;
    contact_phone: string | null;
    assignee: string | null;
    tma_sec: number | null;
  }>(sql`
    SELECT c.id, c.created_at::text, c.resolved_at::text, c.status::text,
           ch.name AS channel,
           ct.name AS contact_name, ct.phone AS contact_phone,
           COALESCE(u.name, u.email) AS assignee,
           EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))::int AS tma_sec
    FROM ${conversations} c
    LEFT JOIN ${channels} ch ON ch.id = c.channel_id
    LEFT JOIN ${contacts} ct ON ct.id = c.contact_id
    LEFT JOIN ${users} u ON u.id = c.assignee_id
    WHERE c.created_at >= ${since}
    ORDER BY c.created_at DESC
    LIMIT 50000
  `)) as unknown as Array<Record<string, unknown>>;

  const headers = ['id', 'created_at', 'resolved_at', 'status', 'channel', 'contact_name', 'contact_phone', 'assignee', 'tma_sec'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      headers
        .map((h) => {
          const v = r[h];
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return /[,"\n]/.test(s) ? `"${s}"` : s;
        })
        .join(','),
    );
  }

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="zora-conversations-${days}d.csv"`,
    },
  });
}
