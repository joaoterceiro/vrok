import { NextResponse } from 'next/server';
import { and, desc, eq, gte, like, sql } from 'drizzle-orm';
import { db, events, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/audit?type=&userId=&since=&limit= — admin-only audit feed.
 * Supports cursor-based pagination via ?before=<id>.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const userId = url.searchParams.get('userId');
  const since = url.searchParams.get('since'); // ISO date
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 200);

  const where = [] as ReturnType<typeof eq>[];
  if (type) where.push(like(events.type, `${type}%`));
  if (userId) where.push(eq(events.userId, userId));
  if (since) where.push(gte(events.createdAt, new Date(since)));

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      conversationId: events.conversationId,
      payload: events.payload,
      createdAt: events.createdAt,
      userId: events.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(events.createdAt))
    .limit(limit);

  // Distinct event types for the filter chip — small enough table to scan.
  const [{ types }] = await db
    .select({
      types: sql<string[]>`COALESCE(ARRAY_AGG(DISTINCT ${events.type}) FILTER (WHERE ${events.type} IS NOT NULL), '{}')`,
    })
    .from(events);

  return NextResponse.json({ events: rows, types });
}
