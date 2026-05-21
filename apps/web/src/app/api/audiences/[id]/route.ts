import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, audiences, audienceContacts, contacts } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [audience] = await db.select().from(audiences).where(eq(audiences.id, id)).limit(1);
  if (!audience) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const members = await db
    .select({
      contactId: audienceContacts.contactId,
      name: contacts.name,
      phone: contacts.phone,
      email: contacts.email,
      variables: audienceContacts.variables,
    })
    .from(audienceContacts)
    .leftJoin(contacts, eq(contacts.id, audienceContacts.contactId))
    .where(eq(audienceContacts.audienceId, id))
    .limit(500);

  return NextResponse.json({ audience, members });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  await db.delete(audiences).where(eq(audiences.id, id));
  return NextResponse.json({ ok: true });
}
