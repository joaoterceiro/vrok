import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, conversations, aiAgents, events } from '@zora/db';
import { REDIS_CHANNELS, SOCKET_ROOMS } from '@zora/shared';
import { requireSession } from '@/lib/api/guards';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z
  .object({
    /** Set to an agent id to use that specific agent for this conversation, or null to revert to the channel default. */
    agentId: z.string().uuid().nullable().optional(),
    /** Set true to pause all agents on this conversation; false to resume. */
    paused: z.boolean().optional(),
  })
  .refine((d) => d.agentId !== undefined || d.paused !== undefined, {
    message: 'Provide agentId or paused',
  });

/**
 * POST /api/conversations/:id/agent
 *
 * Per-conversation agent override and pause toggle. Used by the inbox header
 * to "Pausar bot nesta conversa" or "Trocar agente". Falls back to channel
 * default when `agentId=null`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { agentId, paused } = parsed.data;

  // Validate agent exists if supplied.
  if (agentId) {
    const [agent] = await db
      .select({ id: aiAgents.id, isActive: aiAgents.isActive })
      .from(aiAgents)
      .where(eq(aiAgents.id, agentId))
      .limit(1);
    if (!agent) return NextResponse.json({ error: 'agent_not_found' }, { status: 404 });
    if (!agent.isActive) {
      return NextResponse.json({ error: 'agent_inactive' }, { status: 400 });
    }
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (agentId !== undefined) patch.agentId = agentId;
  if (paused !== undefined) patch.botPausedAt = paused ? new Date() : null;

  const [updated] = await db
    .update(conversations)
    .set(patch)
    .where(eq(conversations.id, id))
    .returning();

  await db.insert(events).values({
    type: paused === true ? 'agent.paused' : paused === false ? 'agent.resumed' : 'agent.changed',
    conversationId: id,
    userId: session.user.id,
    payload: { agentId: agentId ?? null, paused: paused ?? null },
  });

  await redis.publish(
    REDIS_CHANNELS.socketBroadcast,
    JSON.stringify({
      room: SOCKET_ROOMS.conversation(id),
      event: 'conversation:updated',
      data: {
        conversationId: id,
        fields: {
          agentId: updated?.agentId ?? null,
          botPausedAt: updated?.botPausedAt?.toISOString() ?? null,
        },
      },
    }),
  );

  return NextResponse.json({
    ok: true,
    agentId: updated?.agentId ?? null,
    botPausedAt: updated?.botPausedAt ?? null,
  });
}
