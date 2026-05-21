import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, authTokens, users } from '@zora/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/auth/reset — public. Consumes a reset token and rewrites the
 * user's password hash. The token is single-use.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { token, password } = parsed.data;

  const [tok] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.token, token),
        eq(authTokens.kind, 'reset'),
        gt(authTokens.expiresAt, new Date()),
        isNull(authTokens.consumedAt),
      ),
    )
    .limit(1);
  if (!tok?.userId) {
    return NextResponse.json({ error: 'invalid_or_expired' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, tok.userId));

  await db
    .update(authTokens)
    .set({ consumedAt: new Date() })
    .where(eq(authTokens.token, token));

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'token_required' }, { status: 400 });

  const [tok] = await db
    .select({ expiresAt: authTokens.expiresAt, consumedAt: authTokens.consumedAt })
    .from(authTokens)
    .where(and(eq(authTokens.token, token), eq(authTokens.kind, 'reset')))
    .limit(1);
  if (!tok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (tok.consumedAt) return NextResponse.json({ error: 'already_used' }, { status: 410 });
  if (tok.expiresAt < new Date())
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  return NextResponse.json({ ok: true });
}
