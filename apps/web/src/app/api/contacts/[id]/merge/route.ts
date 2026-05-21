import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import {
  db,
  contacts,
  contactIdentities,
  conversations,
  conversationTags,
  contactTags,
  notes,
  events,
  optOuts,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const schema = z.object({
  /** ID of the contact that will be ABSORBED (deleted). */
  sourceId: z.string().uuid(),
});

/**
 * POST /api/contacts/:id/merge — merges `sourceId` INTO `:id`. After the
 * merge, `sourceId` no longer exists and all its conversations, identities,
 * tags, notes, events and opt-outs point to `:id`.
 *
 * Conflict resolution:
 *   - When `:id` has a null field (name/phone/email/avatar) and `sourceId`
 *     has a value, the value gets promoted to `:id`.
 *   - `metadata` is merged shallowly (source values lose on key clash).
 *   - Duplicate `(channel_type, external_id)` identities are dropped from
 *     source before the move (they already exist on target).
 *
 * Admins + supervisors only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role === 'agent') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { id: targetId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  }
  const { sourceId } = parsed.data;
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'cannot_merge_self' }, { status: 400 });
  }

  const [target] = await db.select().from(contacts).where(eq(contacts.id, targetId)).limit(1);
  const [source] = await db.select().from(contacts).where(eq(contacts.id, sourceId)).limit(1);
  if (!target || !source) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // 1) Promote source fields where target is null.
  const mergedMetadata = {
    ...(source.metadata as Record<string, unknown>),
    ...(target.metadata as Record<string, unknown>),
  };
  await db
    .update(contacts)
    .set({
      name: target.name ?? source.name,
      avatarUrl: target.avatarUrl ?? source.avatarUrl,
      phone: target.phone ?? source.phone,
      email: target.email ?? source.email,
      metadata: mergedMetadata,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, targetId));

  // 2) Move identities — drop dupes first via WHERE NOT EXISTS on target.
  await db.execute(sql`
    DELETE FROM ${contactIdentities} src
    WHERE src.contact_id = ${sourceId}
      AND EXISTS (
        SELECT 1 FROM ${contactIdentities} tgt
        WHERE tgt.contact_id = ${targetId}
          AND tgt.channel_type = src.channel_type
          AND tgt.external_id = src.external_id
      )
  `);
  await db
    .update(contactIdentities)
    .set({ contactId: targetId })
    .where(eq(contactIdentities.contactId, sourceId));

  // 3) Move conversations + their notes/tags relationships (cascade rows
  //    already point through conversations, so just re-parent the convo).
  await db
    .update(conversations)
    .set({ contactId: targetId, updatedAt: new Date() })
    .where(eq(conversations.contactId, sourceId));

  // 4) Contact-level tags — promote distinct ones.
  await db.execute(sql`
    INSERT INTO ${contactTags} (contact_id, tag_id)
    SELECT ${targetId}, tag_id FROM ${contactTags} WHERE contact_id = ${sourceId}
    ON CONFLICT (contact_id, tag_id) DO NOTHING
  `);
  await db.delete(contactTags).where(eq(contactTags.contactId, sourceId));

  // 5) Opt-outs follow the contact.
  await db
    .update(optOuts)
    .set({ contactId: targetId })
    .where(eq(optOuts.contactId, sourceId))
    .catch(() => undefined);

  // 6) Audit trail. Conversations/notes/events keep their original IDs.
  await db.insert(events).values({
    type: 'contact.merged',
    userId: session.user.id,
    payload: {
      sourceId,
      targetId,
      sourceName: source.name,
      sourcePhone: source.phone,
      sourceEmail: source.email,
    },
  });

  // 7) Drop the source — its references are all gone.
  await db.delete(contacts).where(eq(contacts.id, sourceId));

  return NextResponse.json({ ok: true, targetId });
}
