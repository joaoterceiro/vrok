import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db, aiAgents, agentAssignments, channels } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().nullable().optional(),
    avatar: z.string().nullable().optional(),
    persona: z.record(z.unknown()).optional(),
    systemPrompt: z.string().min(1).optional(),
    greeting: z.string().nullable().optional(),
    llmConfig: z
      .object({
        provider: z.enum(['anthropic', 'openai', 'groq']).optional(),
        model: z.string().optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().max(8192).optional(),
        handoffKeywords: z.array(z.string()).optional(),
      })
      .optional(),
    toolsEnabled: z.array(z.string()).optional(),
    isDefault: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [agent] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
  if (!agent) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Include the channels this agent is assigned to.
  const assignments = await db
    .select({
      channelId: agentAssignments.channelId,
      priority: agentAssignments.priority,
      channelName: channels.name,
      channelType: channels.type,
      channelStatus: channels.status,
    })
    .from(agentAssignments)
    .leftJoin(channels, eq(channels.id, agentAssignments.channelId))
    .where(eq(agentAssignments.agentId, id));

  return NextResponse.json({ agent, assignments });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [existing] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.isTemplate) {
    return NextResponse.json({ error: 'cannot_edit_template' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;

  // Only one default at a time.
  if (data.isDefault === true) {
    await db
      .update(aiAgents)
      .set({ isDefault: false })
      .where(and(eq(aiAgents.isDefault, true), ne(aiAgents.id, id)));
  }

  const [updated] = await db
    .update(aiAgents)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.avatar !== undefined && { avatar: data.avatar }),
      ...(data.persona !== undefined && { persona: data.persona as Record<string, unknown> }),
      ...(data.systemPrompt !== undefined && { systemPrompt: data.systemPrompt }),
      ...(data.greeting !== undefined && { greeting: data.greeting }),
      ...(data.llmConfig !== undefined && {
        llmConfig: { ...((existing.llmConfig as Record<string, unknown>) ?? {}), ...data.llmConfig },
      }),
      ...(data.toolsEnabled !== undefined && { toolsEnabled: data.toolsEnabled }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      updatedAt: new Date(),
    })
    .where(eq(aiAgents.id, id))
    .returning();

  return NextResponse.json({ agent: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [existing] = await db.select().from(aiAgents).where(eq(aiAgents.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (existing.isTemplate) {
    return NextResponse.json({ error: 'cannot_delete_template' }, { status: 400 });
  }

  await db.delete(aiAgents).where(eq(aiAgents.id, id));
  return NextResponse.json({ ok: true });
}
