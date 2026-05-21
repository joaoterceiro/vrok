import { NextResponse } from 'next/server';
import { eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { db, botFlows } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(10).max(8000).optional(),
  provider: z.enum(['anthropic', 'openai', 'groq']).optional(),
  model: z.string().max(80).optional(),
  handoffKeywords: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const [existing] = await db.select().from(botFlows).where(eq(botFlows.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // If activating, deactivate others.
  if (parsed.data.isActive === true) {
    await db
      .update(botFlows)
      .set({ isActive: false })
      .where(ne(botFlows.id, id));
  }

  const def = (existing.definition as { systemPrompt?: string }) ?? {};
  const llm = (existing.llmConfig as {
    provider?: string;
    model?: string;
    handoffKeywords?: string[];
  }) ?? {};

  const next: Partial<typeof botFlows.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) next.name = parsed.data.name;
  if (parsed.data.description !== undefined) next.description = parsed.data.description;
  if (parsed.data.isActive !== undefined) next.isActive = parsed.data.isActive;
  if (parsed.data.systemPrompt !== undefined) {
    next.definition = { ...def, systemPrompt: parsed.data.systemPrompt };
  }
  if (
    parsed.data.provider !== undefined ||
    parsed.data.model !== undefined ||
    parsed.data.handoffKeywords !== undefined
  ) {
    next.llmConfig = {
      ...llm,
      provider: parsed.data.provider ?? llm.provider,
      model: parsed.data.model ?? llm.model,
      handoffKeywords: parsed.data.handoffKeywords ?? llm.handoffKeywords,
    };
  }

  const [updated] = await db.update(botFlows).set(next).where(eq(botFlows.id, id)).returning();
  return NextResponse.json({ bot: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db.delete(botFlows).where(eq(botFlows.id, id));
  return NextResponse.json({ ok: true });
}
