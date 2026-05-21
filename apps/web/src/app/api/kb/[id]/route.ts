import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, kbArticles } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z
  .object({
    title: z.string().min(1).max(255).optional(),
    summary: z.string().max(500).nullable().optional(),
    body: z.string().min(1).optional(),
    tags: z.array(z.string()).optional(),
    isPublished: z.boolean().optional(),
  })
  .strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const [row] = await db.select().from(kbArticles).where(eq(kbArticles.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!row.isPublished && session.user.role === 'agent') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ article: row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const [updated] = await db
    .update(kbArticles)
    .set({ ...parsed.data, updatedBy: session.user.id, updatedAt: new Date() })
    .where(eq(kbArticles.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db.delete(kbArticles).where(eq(kbArticles.id, id));
  return NextResponse.json({ ok: true });
}
