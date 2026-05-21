import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db, slaRules } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const rows = await db.select().from(slaRules).orderBy(slaRules.priority);
  return NextResponse.json({ rules: rows });
}

const schema = z.object({
  name: z.string().min(2).max(120),
  priority: z.number().int().min(0).max(1000).default(0),
  match: z.record(z.string(), z.unknown()).default({}),
  firstResponseMinutes: z.number().int().min(1).max(60 * 24 * 7).default(30),
  resolutionMinutes: z.number().int().min(1).max(60 * 24 * 30).default(1440),
  isActive: z.boolean().default(true),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const [created] = await db.insert(slaRules).values(parsed.data).returning();
  return NextResponse.json({ rule: created });
}
