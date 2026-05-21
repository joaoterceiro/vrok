import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq, sql } from 'drizzle-orm';
import { db, aiAgents, agentAssignments } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const llmConfigSchema = z
  .object({
    provider: z.enum(['anthropic', 'openai', 'groq']).optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().max(8192).optional(),
    handoffKeywords: z.array(z.string()).optional(),
  })
  .strict()
  .default({});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  persona: z.record(z.unknown()).default({}),
  systemPrompt: z.string().min(1),
  greeting: z.string().nullable().optional(),
  llmConfig: llmConfigSchema,
  toolsEnabled: z.array(z.string()).default([]),
  isDefault: z.boolean().optional(),
  fromTemplateId: z.string().uuid().optional(),
});

/**
 * GET /api/ai-agents — list agents, including templates. The UI groups by
 * `is_template` to render the gallery vs. user-created sections.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      id: aiAgents.id,
      slug: aiAgents.slug,
      name: aiAgents.name,
      description: aiAgents.description,
      avatar: aiAgents.avatar,
      persona: aiAgents.persona,
      systemPrompt: aiAgents.systemPrompt,
      greeting: aiAgents.greeting,
      llmConfig: aiAgents.llmConfig,
      toolsEnabled: aiAgents.toolsEnabled,
      isTemplate: aiAgents.isTemplate,
      isDefault: aiAgents.isDefault,
      isActive: aiAgents.isActive,
      createdAt: aiAgents.createdAt,
      assignedChannels: sql<number>`(
        SELECT COUNT(*) FROM ${agentAssignments} WHERE ${agentAssignments.agentId} = ${aiAgents.id}
      )`,
    })
    .from(aiAgents)
    .orderBy(desc(aiAgents.isTemplate), desc(aiAgents.createdAt));

  return NextResponse.json({ agents: rows });
}

/**
 * POST /api/ai-agents — create a user agent. When `fromTemplateId` is set,
 * the named template is cloned and overridden by the provided fields.
 * Only admins can create agents.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  // Clone-from-template: load template as baseline, then merge user fields.
  let base = parsed.data;
  if (parsed.data.fromTemplateId) {
    const [tpl] = await db
      .select()
      .from(aiAgents)
      .where(eq(aiAgents.id, parsed.data.fromTemplateId))
      .limit(1);
    if (!tpl || !tpl.isTemplate) {
      return NextResponse.json({ error: 'template_not_found' }, { status: 404 });
    }
    base = {
      ...base,
      persona: parsed.data.persona ?? (tpl.persona as Record<string, unknown>),
      systemPrompt: parsed.data.systemPrompt ?? tpl.systemPrompt,
      greeting: parsed.data.greeting ?? tpl.greeting,
      llmConfig: { ...(tpl.llmConfig ?? {}), ...parsed.data.llmConfig },
      toolsEnabled: parsed.data.toolsEnabled ?? tpl.toolsEnabled,
    };
  }

  // Only one default at a time.
  if (base.isDefault) {
    await db.update(aiAgents).set({ isDefault: false }).where(eq(aiAgents.isDefault, true));
  }

  const [created] = await db
    .insert(aiAgents)
    .values({
      name: base.name,
      description: base.description ?? null,
      avatar: base.avatar ?? null,
      persona: base.persona as Record<string, unknown>,
      systemPrompt: base.systemPrompt,
      greeting: base.greeting ?? null,
      llmConfig: base.llmConfig,
      toolsEnabled: base.toolsEnabled ?? [],
      isTemplate: false,
      isDefault: base.isDefault ?? false,
      isActive: true,
    })
    .returning();

  return NextResponse.json({ agent: created }, { status: 201 });
}
