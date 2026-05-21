import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, conversationTags } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bodySchema = z.object({ tagId: z.string().uuid() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  await db
    .insert(conversationTags)
    .values({ conversationId: id, tagId: parsed.data.tagId })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const url = new URL(req.url);
  const tagId = url.searchParams.get('tagId');
  if (!tagId) return NextResponse.json({ error: 'missing tagId' }, { status: 400 });
  await db
    .delete(conversationTags)
    .where(and(eq(conversationTags.conversationId, id), eq(conversationTags.tagId, tagId)));
  return NextResponse.json({ ok: true });
}
