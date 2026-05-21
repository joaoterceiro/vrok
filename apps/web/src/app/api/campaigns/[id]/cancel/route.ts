import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db, campaigns, campaignMessages } from '@zora/db';
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
    .set({ status: 'canceled', updatedAt: new Date(), completedAt: new Date() })
    .where(eq(campaigns.id, id));
  // Mark pending campaign_messages as failed so they don't get picked up.
  await db
    .update(campaignMessages)
    .set({ status: 'failed', error: 'campaign canceled' })
    .where(
      eq(campaignMessages.campaignId, id),
    );
  return NextResponse.json({ ok: true });
}
