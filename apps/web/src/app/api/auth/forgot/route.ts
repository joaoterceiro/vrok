import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, authTokens, users } from '@zora/db';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({ email: z.string().email() });

/**
 * POST /api/auth/forgot — public. Always returns 200 (no user enumeration)
 * but only emails when the address has an active account.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: true }); // intentional opaque response
  }
  const { email } = parsed.data;

  const [user] = await db
    .select({ id: users.id, name: users.name, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (user?.isActive) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 60_000); // 1h

    await db.insert(authTokens).values({
      token,
      kind: 'reset',
      userId: user.id,
      expiresAt,
    });

    const base = process.env.APP_URL ?? new URL(req.url).origin;
    const resetUrl = `${base}/reset-password/${token}`;

    await sendEmail({
      to: email,
      subject: 'Redefinir sua senha do Vrok',
      text: [
        `Olá${user.name ? `, ${user.name}` : ''}!`,
        ``,
        `Recebemos um pedido de redefinição de senha. O link abaixo expira em 1 hora:`,
        resetUrl,
        ``,
        `Se você não fez essa solicitação, ignore este email — sua senha continua a mesma.`,
      ].join('\n'),
    });
  }

  return NextResponse.json({ ok: true });
}
