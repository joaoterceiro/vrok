import { NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, campaigns, campaignMessages, contacts } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Tally counters from campaign_messages.
  const tally = await db
    .select({
      status: campaignMessages.status,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(campaignMessages)
    .where(eq(campaignMessages.campaignId, id))
    .groupBy(campaignMessages.status);

  // Sample of recent failures + recipients for visibility.
  const recent = await db
    .select({
      id: campaignMessages.id,
      status: campaignMessages.status,
      error: campaignMessages.error,
      sentAt: campaignMessages.sentAt,
      contact: { name: contacts.name, phone: contacts.phone, email: contacts.email },
    })
    .from(campaignMessages)
    .leftJoin(contacts, eq(contacts.id, campaignMessages.contactId))
    .where(eq(campaignMessages.campaignId, id))
    .orderBy(desc(campaignMessages.createdAt))
    .limit(50);

  return NextResponse.json({
    campaign,
    counters: Object.fromEntries(tally.map((t) => [t.status, t.count])),
    recent,
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true });
}
