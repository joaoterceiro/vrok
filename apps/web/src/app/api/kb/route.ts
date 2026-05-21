import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db, kbArticles } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/kb — list articles (admin + supervisor see drafts, agents only
 * published). Paginated by `?limit` and `?offset`.
 */
export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const includeDrafts = session.user.role !== 'agent';

  const rows = await db
    .select({
      id: kbArticles.id,
      title: kbArticles.title,
      summary: kbArticles.summary,
      tags: kbArticles.tags,
      isPublished: kbArticles.isPublished,
      updatedAt: kbArticles.updatedAt,
    })
    .from(kbArticles)
    .where(includeDrafts ? undefined : eq(kbArticles.isPublished, true))
    .orderBy(desc(kbArticles.updatedAt))
    .limit(limit);

  return NextResponse.json({ articles: rows });
}

const createSchema = z.object({
  title: z.string().min(1).max(255),
  summary: z.string().max(500).nullable().optional(),
  body: z.string().min(1),
  tags: z.array(z.string()).default([]),
  isPublished: z.boolean().default(true),
});

/**
 * POST /api/kb — create an article. Admin + supervisor.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }

  const [created] = await db
    .insert(kbArticles)
    .values({
      title: parsed.data.title,
      summary: parsed.data.summary ?? null,
      body: parsed.data.body,
      tags: parsed.data.tags,
      isPublished: parsed.data.isPublished,
      createdBy: session.user.id,
      updatedBy: session.user.id,
    })
    .returning();

  return NextResponse.json({ article: created }, { status: 201 });
}
