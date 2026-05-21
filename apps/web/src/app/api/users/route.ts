import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      isActive: users.isActive,
      lastSeenAt: users.lastSeenAt,
    })
    .from(users)
    .orderBy(users.email);
  return NextResponse.json({ users: rows });
}

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(255).optional(),
  password: z.string().min(6).max(128),
  role: z.enum(['admin', 'supervisor', 'agent']).default('agent'),
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
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [created] = await db
    .insert(users)
    .values({
      email: parsed.data.email.toLowerCase(),
      name: parsed.data.name ?? null,
      passwordHash,
      role: parsed.data.role,
      isActive: true,
      status: 'offline',
    })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

  if (!created) {
    return NextResponse.json({ error: 'email already exists' }, { status: 409 });
  }
  return NextResponse.json({ user: created });
}
