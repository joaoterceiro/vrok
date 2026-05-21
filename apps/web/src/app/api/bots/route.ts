import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, botFlows } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db.select().from(botFlows).orderBy(botFlows.createdAt);
  return NextResponse.json({ bots: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  systemPrompt: z.string().min(10).max(8000),
  provider: z.enum(['anthropic', 'openai', 'groq']).default('anthropic'),
  model: z.string().max(80).optional(),
  handoffKeywords: z.array(z.string()).default([]),
  isActive: z.boolean().default(false),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  // Single active flow in Phase 4 — deactivate all others if this one is active.
  if (input.isActive) {
    await db.update(botFlows).set({ isActive: false }).where(eq(botFlows.isActive, true));
  }

  const [created] = await db
    .insert(botFlows)
    .values({
      name: input.name,
      description: input.description ?? null,
      trigger: 'new_conversation',
      isActive: input.isActive,
      definition: { systemPrompt: input.systemPrompt },
      llmConfig: {
        provider: input.provider,
        model: input.model,
        handoffKeywords: input.handoffKeywords,
      },
    })
    .returning();
  return NextResponse.json({ bot: created });
}
