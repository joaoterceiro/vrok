import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, campaigns } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db
    .update(campaigns)
    .set({ status: 'paused', updatedAt: new Date() })
    .where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
