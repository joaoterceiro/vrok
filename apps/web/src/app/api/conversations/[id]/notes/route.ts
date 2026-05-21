import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, notes, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const rows = await db
    .select({
      id: notes.id,
      body: notes.body,
      createdAt: notes.createdAt,
      authorId: notes.userId,
      authorName: users.name,
    })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.userId))
    .where(eq(notes.conversationId, id))
    .orderBy(desc(notes.createdAt))
    .limit(100);
  return NextResponse.json({ notes: rows });
}

const createSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const [created] = await db
    .insert(notes)
    .values({ conversationId: id, userId: session.user.id, body: parsed.data.body })
    .returning();
  return NextResponse.json({ note: created });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const url = new URL(req.url);
  const noteId = url.searchParams.get('noteId');
  if (!noteId) return NextResponse.json({ error: 'missing noteId' }, { status: 400 });

  // Agents can delete only their own; supervisors+admins can delete any.
  const where =
    session.user.role === 'agent'
      ? and(eq(notes.id, noteId), eq(notes.conversationId, id), eq(notes.userId, session.user.id))
      : and(eq(notes.id, noteId), eq(notes.conversationId, id));
  await db.delete(notes).where(where!);
  return NextResponse.json({ ok: true });
}
