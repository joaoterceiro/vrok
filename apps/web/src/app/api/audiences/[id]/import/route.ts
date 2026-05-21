import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  audiences,
  audienceContacts,
  contacts,
  contactIdentities,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const rowSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
});

const bodySchema = z.object({
  rows: z.array(z.record(z.string(), z.string())).max(20000),
});

/**
 * POST /api/audiences/:id/import — bulk-import contacts into an audience.
 * Each row is keyed by column name. `phone` and `email` are required for
 * matching; everything else is preserved as a per-contact variable map.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const [audience] = await db.select().from(audiences).where(eq(audiences.id, id)).limit(1);
  if (!audience) return NextResponse.json({ error: 'audience not found' }, { status: 404 });

  let added = 0;
  let skipped = 0;
  for (const raw of parsed.data.rows) {
    const r = rowSchema.safeParse(raw);
    if (!r.success || (!r.data.phone && !r.data.email)) {
      skipped++;
      continue;
    }
    const phone = r.data.phone ? normalizePhone(r.data.phone) : null;
    const email = r.data.email?.toLowerCase().trim() ?? null;
    if (!phone && !email) {
      skipped++;
      continue;
    }

    // Upsert contact by phone first, then email.
    let contactId: string | null = null;
    if (phone) {
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.phone, phone))
        .limit(1);
      contactId = existing?.id ?? null;
    }
    if (!contactId && email) {
      const [existing] = await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.email, email))
        .limit(1);
      contactId = existing?.id ?? null;
    }
    if (!contactId) {
      const [created] = await db
        .insert(contacts)
        .values({
          name: r.data.name ?? null,
          phone,
          email,
        })
        .returning({ id: contacts.id });
      contactId = created?.id ?? null;
    }
    if (!contactId) {
      skipped++;
      continue;
    }

    // Build per-contact vars (everything not in the standard columns).
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === 'phone' || k === 'email' || k === 'name') continue;
      vars[k] = String(v);
    }

    await db
      .insert(audienceContacts)
      .values({ audienceId: id, contactId, variables: vars })
      .onConflictDoUpdate({
        target: [audienceContacts.audienceId, audienceContacts.contactId],
        set: { variables: vars },
      });
    added++;
  }

  // Update audience count + lastBuiltAt.
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(audienceContacts)
    .where(eq(audienceContacts.audienceId, id));
  await db
    .update(audiences)
    .set({ contactCount: count, lastBuiltAt: new Date(), updatedAt: new Date() })
    .where(eq(audiences.id, id));

  return NextResponse.json({ added, skipped, total: count });
}

function normalizePhone(p: string): string {
  // Strip everything but digits; keep leading + if present.
  const trimmed = p.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}
