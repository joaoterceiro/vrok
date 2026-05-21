import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, campaigns } from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (c.status === 'running' || c.status === 'completed') {
    return NextResponse.json({ error: `campaign already ${c.status}` }, { status: 400 });
  }

  const startAt = c.scheduleAt && c.scheduleAt.getTime() > Date.now() ? c.scheduleAt : new Date();
  await db
    .update(campaigns)
    .set({ status: 'scheduled', updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  await queues.campaignDispatch.add(
    'dispatch',
    { campaignId: id },
    {
      delay: Math.max(0, startAt.getTime() - Date.now()),
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 50,
    },
  );

  return NextResponse.json({ ok: true, startAt });
}
