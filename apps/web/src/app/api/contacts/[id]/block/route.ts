import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, contacts, optOuts, conversations } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/contacts/:id/block
 *
 * Marks the contact as blocked AND inserts a channel-agnostic opt-out so
 * campaigns + bots respect the block across every channel. Idempotent.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
  if (!contact) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Mark on the contact row (UI uses metadata.blocked for the badge).
  await db
    .update(contacts)
    .set({
      metadata: sql`COALESCE(${contacts.metadata}, '{}'::jsonb) || '{"blocked": true, "blockedAt": "${new Date().toISOString()}"}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id));

  // Channel-agnostic opt-out (null channelType blocks ALL outbound).
  await db
    .insert(optOuts)
    .values({
      contactId: id,
      channelType: null,
      source: 'manual',
      reason: `Blocked by ${session.user.email}`,
    })
    .onConflictDoNothing({ target: [optOuts.contactId, optOuts.channelType] });

  // Close any open conversations.
  await db
    .update(conversations)
    .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.contactId, id));

  return NextResponse.json({ ok: true });
}

/**
 * DELETE — unblock: removes the channel-agnostic opt-out and flips the
 * blocked flag off in metadata.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db
    .update(contacts)
    .set({
      metadata: sql`COALESCE(${contacts.metadata}, '{}'::jsonb) || '{"blocked": false}'::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id));
  await db
    .delete(optOuts)
    .where(sql`${optOuts.contactId} = ${id} AND ${optOuts.channelType} IS NULL`);
  return NextResponse.json({ ok: true });
}
