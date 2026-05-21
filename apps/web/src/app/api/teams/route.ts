import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, teams, teamMembers } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      color: teams.color,
      description: teams.description,
      memberCount: sql<number>`(SELECT COUNT(*)::int FROM ${teamMembers} WHERE ${teamMembers.teamId} = ${teams.id})`,
    })
    .from(teams)
    .orderBy(teams.name);

  return NextResponse.json({ teams: rows });
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9_-]+$/, 'use a-z 0-9 _ -'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#fa4374'),
  description: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const [created] = await db.insert(teams).values(parsed.data).returning();
  return NextResponse.json({ team: created });
}
