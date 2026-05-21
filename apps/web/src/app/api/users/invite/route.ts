import { NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { db, authTokens, users } from '@zora/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/api/guards';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'supervisor', 'agent']).default('agent'),
  teamId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
});

/**
 * POST /api/users/invite — admin creates a single-use invite token and
 * (best-effort) emails it. Returns the invite URL too, so the admin can
 * forward it manually when SMTP isn't configured.
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { email, role, teamId, note } = parsed.data;

  // Block re-invites of existing active accounts.
  const [existing] = await db
    .select({ id: users.id, isActive: users.isActive })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing?.isActive) {
    return NextResponse.json(
      { error: 'user_exists', detail: 'Já existe um usuário ativo com esse email' },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000); // 7 days

  await db.insert(authTokens).values({
    token,
    kind: 'invite',
    email,
    role,
    teamId: teamId ?? null,
    note: note ?? null,
    createdBy: session.user.id,
    expiresAt,
  });

  const base = process.env.APP_URL ?? new URL(req.url).origin;
  const inviteUrl = `${base}/accept-invite/${token}`;

  const delivery = await sendEmail({
    to: email,
    subject: 'Você foi convidado para o Vrok',
    text: [
      `Olá!`,
      ``,
      `${session.user.name ?? session.user.email} convidou você para a plataforma Vrok como ${role}.`,
      ``,
      `Aceite o convite e crie sua senha em até 7 dias:`,
      `${inviteUrl}`,
      ``,
      note ? `Mensagem do convite:\n${note}` : '',
      `\nSe você não esperava este email, pode ignorar com segurança.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  return NextResponse.json({
    ok: true,
    inviteUrl,
    delivery: delivery.delivered,
    expiresAt: expiresAt.toISOString(),
  });
}
