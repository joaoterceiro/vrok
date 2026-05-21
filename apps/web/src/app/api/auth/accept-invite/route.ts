import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, authTokens, users, teamMembers } from '@zora/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).max(255),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/auth/accept-invite — public endpoint. Consumes the invite
 * token, creates the user (or reactivates) and adds to the team if any.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { token, name, password } = parsed.data;

  const [tok] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.token, token),
        eq(authTokens.kind, 'invite'),
        gt(authTokens.expiresAt, new Date()),
        isNull(authTokens.consumedAt),
      ),
    )
    .limit(1);
  if (!tok || !tok.email || !tok.role) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Upsert user — if email exists but inactive, reactivate.
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, tok.email))
    .limit(1);

  let userId: string;
  if (existing) {
    await db
      .update(users)
      .set({
        name,
        passwordHash,
        role: tok.role as 'admin' | 'supervisor' | 'agent',
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id));
    userId = existing.id;
  } else {
    const [created] = await db
      .insert(users)
      .values({
        name,
        email: tok.email,
        passwordHash,
        role: tok.role as 'admin' | 'supervisor' | 'agent',
        isActive: true,
      })
      .returning({ id: users.id });
    userId = created!.id;
  }

  // Optional team membership.
  if (tok.teamId) {
    await db
      .insert(teamMembers)
      .values({ teamId: tok.teamId, userId, roleInTeam: 'member' })
      .onConflictDoNothing();
  }

  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(eq(authTokens.token, token));

  return NextResponse.json({ ok: true, email: tok.email });
}

/**
 * GET /api/auth/accept-invite?token=... — preview the invite (used by the
 * acceptance page to render context before the user submits).
 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token_required' }, { status: 400 });

  const [tok] = await db
    .select({
      email: authTokens.email,
      role: authTokens.role,
      note: authTokens.note,
      expiresAt: authTokens.expiresAt,
      consumedAt: authTokens.consumedAt,
    })
    .from(authTokens)
    .where(and(eq(authTokens.token, token), eq(authTokens.kind, 'invite')))
    .limit(1);

  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tok.consumedAt) return NextResponse.json({ error: 'already_used' }, { status: 410 });
  if (tok.expiresAt < new Date())
    return NextResponse.json({ error: 'expired' }, { status: 410 });

  return NextResponse.json({
    email: tok.email,
    role: tok.role,
    note: tok.note,
    expiresAt: tok.expiresAt,
  });
}
