import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, optOuts, contacts } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      id: optOuts.id,
      contactId: optOuts.contactId,
      channelType: optOuts.channelType,
      source: optOuts.source,
      reason: optOuts.reason,
      createdAt: optOuts.createdAt,
      contact: {
        name: contacts.name,
        phone: contacts.phone,
        email: contacts.email,
      },
    })
    .from(optOuts)
    .leftJoin(contacts, eq(contacts.id, optOuts.contactId))
    .orderBy(desc(optOuts.createdAt))
    .limit(500);

  return NextResponse.json({ optOuts: rows });
}

const createSchema = z.object({
  contactId: z.string().uuid(),
  channelType: z
    .enum(['wa_evolution', 'wa_cloud', 'instagram', 'telegram', 'webchat', 'email'])
    .nullable()
    .optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const [created] = await db
    .insert(optOuts)
    .values({
      contactId: parsed.data.contactId,
      channelType: parsed.data.channelType ?? null,
      source: 'manual',
      reason: parsed.data.reason ?? null,
    })
    .onConflictDoNothing({ target: [optOuts.contactId, optOuts.channelType] })
    .returning();
  return NextResponse.json({ optOut: created });
}

export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  await db.delete(optOuts).where(eq(optOuts.id, id));
  return NextResponse.json({ ok: true });
}
