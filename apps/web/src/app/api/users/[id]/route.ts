import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, users } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  role: z.enum(['admin', 'supervisor', 'agent']).optional(),
  status: z.enum(['available', 'busy', 'offline']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(128).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const isSelf = session.user.id === id;
  if (!isSelf && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  // Self users can only change their own name/status/password; only admins can change role/isActive.
  if (isSelf && session.user.role !== 'admin') {
    if (parsed.data.role !== undefined || parsed.data.isActive !== undefined) {
      return NextResponse.json({ error: 'cannot self-modify role/isActive' }, { status: 403 });
    }
  }

  const updates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.password) updates.passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      isActive: users.isActive,
    });
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ user: updated });
}
