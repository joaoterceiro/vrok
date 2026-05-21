import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, aiAgents, agentAssignments } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const upsertSchema = z.object({
  channelIds: z.array(z.string().uuid()).min(0),
  priority: z.number().int().min(0).max(1000).default(0),
});

/**
 * POST /api/ai-agents/:id/assignments
 *
 * Replaces this agent's set of assigned channels with the supplied list.
 * Use an empty `channelIds` to detach from all channels.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = upsertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { channelIds, priority } = parsed.data;

  // Drop assignments that aren't in the new set.
  if (channelIds.length === 0) {
    await db.delete(agentAssignments).where(eq(agentAssignments.agentId, id));
  } else {
    await db
      .delete(agentAssignments)
      .where(
        and(
          eq(agentAssignments.agentId, id),
          sql`${agentAssignments.channelId} NOT IN (${sql.join(
            channelIds.map((c) => sql`${c}::uuid`),
            sql`, `,
          )})`,
        ),
      );
  }

  // Upsert the remaining assignments.
  for (const channelId of channelIds) {
    await db
      .insert(agentAssignments)
      .values({ agentId: id, channelId, priority })
      .onConflictDoUpdate({
        target: [agentAssignments.agentId, agentAssignments.channelId],
        set: { priority },
      });
  }

  return NextResponse.json({ ok: true, channelCount: channelIds.length });
}

/**
 * DELETE /api/ai-agents/:id/assignments?channelId=...
 *
 * Removes a single channel assignment. If `channelId` is omitted, removes ALL
 * assignments for the agent (same as POST with empty channelIds).
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const channelId = url.searchParams.get('channelId');

  if (channelId) {
    await db
      .delete(agentAssignments)
      .where(
        and(eq(agentAssignments.agentId, id), eq(agentAssignments.channelId, channelId)),
      );
  } else {
    await db.delete(agentAssignments).where(eq(agentAssignments.agentId, id));
  }

  return NextResponse.json({ ok: true });
}
