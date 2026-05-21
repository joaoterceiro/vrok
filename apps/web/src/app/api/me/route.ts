import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/me — current user profile (full row, minus password hash).
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      status: users.status,
      lastSeenAt: users.lastSeenAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ user: row });
}

const patchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    image: z.string().url().nullable().optional(),
    status: z.enum(['available', 'busy', 'offline']).optional(),
    // Optional password change — requires currentPassword.
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .strict();

/**
 * PATCH /api/me — self-service profile/password edit. Password change
 * requires the current password to be present and correct.
 */
export async function PATCH(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { name, image, status, currentPassword, newPassword } = parsed.data;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = name;
  if (image !== undefined) patch.image = image;
  if (status !== undefined) patch.status = status;

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: 'current_password_required' },
        { status: 400 },
      );
    }
    const [row] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    if (!row?.passwordHash) {
      return NextResponse.json(
        { error: 'no_password_set', detail: 'Conta criada via SSO — defina senha pelo fluxo de reset' },
        { status: 400 },
      );
    }
    const ok = await bcrypt.compare(currentPassword, row.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 });
    }
    patch.passwordHash = await bcrypt.hash(newPassword, 10);
  }

  await db.update(users).set(patch).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true, passwordChanged: !!newPassword });
}
