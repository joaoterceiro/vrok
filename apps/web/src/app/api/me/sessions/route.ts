import { NextResponse } from 'next/server';
import { and, eq, gt, ne } from 'drizzle-orm';
import { db, sessions } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/me/sessions — list this user's active database sessions.
 * Returns nothing useful for JWT-only setups, but harmless when both
 * JWT and DB sessions are enabled (NextAuth dual-mode).
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const rows = await db
    .select({
      sessionToken: sessions.sessionToken,
      expires: sessions.expires,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, session.user.id), gt(sessions.expires, new Date())));

  return NextResponse.json({ sessions: rows });
}

/**
 * DELETE /api/me/sessions — revoke all OTHER sessions for this user.
 * The current session token (if known) is preserved. With JWT-only auth
 * this is a no-op but the endpoint stays for future DB-session support.
 */
export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  // Try to identify the current session token from cookie (NextAuth uses
  // `authjs.session-token` or `__Secure-authjs.session-token`).
  const cookie = req.headers.get('cookie') ?? '';
  const m =
    cookie.match(/(?:__Secure-)?authjs\.session-token=([^;]+)/) ||
    cookie.match(/(?:__Secure-)?next-auth\.session-token=([^;]+)/);
  const currentToken = m?.[1] ?? null;

  if (currentToken) {
    await db
      .delete(sessions)
      .where(
        and(eq(sessions.userId, session.user.id), ne(sessions.sessionToken, currentToken)),
      );
  } else {
    await db.delete(sessions).where(eq(sessions.userId, session.user.id));
  }
  return NextResponse.json({ ok: true });
}
