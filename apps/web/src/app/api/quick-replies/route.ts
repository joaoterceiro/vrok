import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, quickReplies } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db.select().from(quickReplies).orderBy(quickReplies.shortcut);
  return NextResponse.json({ quickReplies: rows });
}

const createSchema = z.object({
  shortcut: z.string().min(1).max(64).regex(/^[a-z0-9_-]+$/i, 'use letras, números, _ ou -'),
  body: z.string().min(1).max(2000),
  teamId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const [created] = await db.insert(quickReplies).values(parsed.data).returning();
  return NextResponse.json({ quickReply: created });
}
