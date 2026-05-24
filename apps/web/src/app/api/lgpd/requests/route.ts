import { NextResponse } from 'next/server';
import { db, events } from '@zora/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/lgpd/requests?status=pending|in_progress|resolved|all
 *
 * Lista todas as solicitações LGPD recebidas via formulário público.
 * Apenas admin + supervisor.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? 'all';
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);

  const filters = [eq(events.type, 'lgpd_request')];
  if (status !== 'all') {
    filters.push(sql`(${events.payload}->>'status') = ${status}`);
  }

  const rows = await db
    .select()
    .from(events)
    .where(and(...filters))
    .orderBy(desc(events.createdAt))
    .limit(limit);

  return NextResponse.json({
    requests: rows.map((r) => {
      const p = (r.payload as Record<string, unknown>) ?? {};
      return {
        id: r.id,
        protocol: p.protocol,
        requestType: p.requestType,
        fullName: p.fullName,
        cpfMasked: p.cpfMasked,
        email: p.email,
        phone: p.phone,
        details: p.details,
        status: p.status ?? 'pending',
        receivedAt: r.createdAt,
        resolvedAt: p.resolvedAt,
        resolution: p.resolution,
      };
    }),
  });
}
