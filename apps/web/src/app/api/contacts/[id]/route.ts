import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, contacts } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const patchSchema = z
  .object({
    name: z.string().min(0).max(255).optional(),
    phone: z.string().max(40).nullable().optional(),
    email: z.string().email().nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'body must include at least one field');

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }

  const patch: Partial<typeof contacts.$inferInsert> = { updatedAt: new Date() };
  const input = parsed.data;
  if (input.name !== undefined) patch.name = input.name.length === 0 ? null : input.name;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email?.toLowerCase() ?? null;
  if (input.avatarUrl !== undefined) patch.avatarUrl = input.avatarUrl;
  // Merge metadata shallowly so partial updates don't blow away existing keys.
  if (input.metadata) {
    patch.metadata = sql`COALESCE(${contacts.metadata}, '{}'::jsonb) || ${JSON.stringify(input.metadata)}::jsonb` as never;
  }

  const [updated] = await db
    .update(contacts)
    .set(patch)
    .where(eq(contacts.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ contact: updated });
}
