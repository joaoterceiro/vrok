import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, events, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/conversations/:id/timeline
 *
 * Audit trail: returns every `events` row for this conversation (assignments,
 * transfers, status changes, bot handoffs, message failures) joined with the
 * acting user. Most recent first, capped at 100.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      payload: events.payload,
      createdAt: events.createdAt,
      actor: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.userId))
    .where(eq(events.conversationId, id))
    .orderBy(desc(events.createdAt))
    .limit(100);

  return NextResponse.json({ events: rows });
}
