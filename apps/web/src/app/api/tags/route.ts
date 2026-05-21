import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, tags } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db.select().from(tags).orderBy(tags.name);
  return NextResponse.json({ tags: rows });
}

const createSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#71717a'),
  scope: z.enum(['conversation', 'contact']).default('conversation'),
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
  const [created] = await db
    .insert(tags)
    .values(parsed.data)
    .onConflictDoNothing({ target: tags.name })
    .returning();
  if (!created) return NextResponse.json({ error: 'duplicate' }, { status: 409 });
  return NextResponse.json({ tag: created });
}
