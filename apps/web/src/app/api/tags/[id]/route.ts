import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, tags } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db.delete(tags).where(eq(tags.id, id));
  return NextResponse.json({ ok: true });
}
