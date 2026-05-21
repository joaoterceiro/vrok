import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, audiences } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db.select().from(audiences).orderBy(audiences.createdAt);
  return NextResponse.json({ audiences: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  source: z.enum(['manual', 'csv', 'filter']).default('manual'),
  filterQuery: z.record(z.string(), z.unknown()).optional(),
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
    .insert(audiences)
    .values({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      source: parsed.data.source,
      filterQuery: parsed.data.filterQuery ?? null,
    })
    .returning();
  return NextResponse.json({ audience: created });
}
