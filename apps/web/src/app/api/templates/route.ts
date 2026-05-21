import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, messageTemplates } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db
    .select()
    .from(messageTemplates)
    .orderBy(messageTemplates.createdAt);
  return NextResponse.json({ templates: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(120).regex(/^[a-z0-9_]+$/, 'use snake_case'),
  channelType: z.enum(['wa_evolution', 'wa_cloud', 'instagram', 'telegram', 'webchat', 'email']),
  language: z.string().min(2).max(16).default('pt_BR'),
  category: z.enum(['marketing', 'utility', 'authentication']).default('utility'),
  body: z.string().min(1).max(2048),
  footer: z.string().max(120).optional(),
  variables: z.array(z.string()).default([]),
  providerTemplateId: z.string().max(255).optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const i = parsed.data;
  // Auto-detect variables from body if not explicitly given.
  const detected = Array.from(new Set([...i.body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]!)));
  const variables = i.variables.length > 0 ? i.variables : detected;

  const [created] = await db
    .insert(messageTemplates)
    .values({
      name: i.name,
      channelType: i.channelType,
      language: i.language,
      category: i.category,
      body: i.body,
      footer: i.footer ?? null,
      variables,
      providerTemplateId: i.providerTemplateId ?? null,
      status: i.providerTemplateId ? 'approved' : 'draft',
    })
    .returning();
  return NextResponse.json({ template: created });
}
