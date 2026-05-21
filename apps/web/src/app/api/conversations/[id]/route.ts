import { NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  db,
  conversations,
  contacts,
  channels,
  messages,
  tags,
  conversationTags,
  notes,
  users,
  events,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { redis } from '@/lib/redis';
import { REDIS_CHANNELS, SOCKET_ROOMS } from '@zora/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// --- GET --------------------------------------------------------

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [row] = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      priority: conversations.priority,
      teamId: conversations.teamId,
      assigneeId: conversations.assigneeId,
      unreadCount: conversations.unreadCount,
      lastMessageAt: conversations.lastMessageAt,
      lastMessagePreview: conversations.lastMessagePreview,
      slaDueAt: conversations.slaDueAt,
      snoozedUntil: conversations.snoozedUntil,
      resolvedAt: conversations.resolvedAt,
      agentId: conversations.agentId,
      botPausedAt: conversations.botPausedAt,
      contact: {
        id: contacts.id,
        name: contacts.name,
        avatarUrl: contacts.avatarUrl,
        phone: contacts.phone,
        email: contacts.email,
      },
      channel: {
        id: channels.id,
        type: channels.type,
        name: channels.name,
      },
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .innerJoin(channels, eq(channels.id, conversations.channelId))
    .where(eq(conversations.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [msgs, tagRows, noteRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        direction: messages.direction,
        sender: messages.sender,
        contentType: messages.contentType,
        body: messages.body,
        attachments: messages.attachments,
        status: messages.status,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
        deliveredAt: messages.deliveredAt,
        readAt: messages.readAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .limit(500),
    db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(conversationTags)
      .innerJoin(tags, eq(tags.id, conversationTags.tagId))
      .where(eq(conversationTags.conversationId, id)),
    db
      .select({
        id: notes.id,
        body: notes.body,
        createdAt: notes.createdAt,
        authorId: notes.userId,
        authorName: users.name,
      })
      .from(notes)
      .leftJoin(users, eq(users.id, notes.userId))
      .where(eq(notes.conversationId, id))
      .orderBy(desc(notes.createdAt))
      .limit(50),
  ]);

  // Mark as read on server side.
  if (row.unreadCount > 0) {
    await db.update(conversations).set({ unreadCount: 0 }).where(eq(conversations.id, id));
  }

  return NextResponse.json({ conversation: row, messages: msgs, tags: tagRows, notes: noteRows });
}

// --- PATCH ------------------------------------------------------

const patchSchema = z
  .object({
    status: z.enum(['open', 'pending', 'resolved', 'snoozed']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    assigneeId: z.string().uuid().nullable().optional(),
    teamId: z.string().uuid().nullable().optional(),
    snoozedUntil: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'body must include at least one field');

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Permission check: agents can claim/resolve their own; supervisors/admins can do anything.
  if (session.user.role === 'agent' && input.assigneeId && input.assigneeId !== session.user.id) {
    return NextResponse.json({ error: 'agents can only assign conversations to themselves' }, { status: 403 });
  }

  const updates: Partial<typeof conversations.$inferInsert> = { updatedAt: new Date() };
  if (input.status !== undefined) {
    updates.status = input.status;
    if (input.status === 'resolved') updates.resolvedAt = new Date();
    if (input.status !== 'snoozed') updates.snoozedUntil = null;
  }
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.assigneeId !== undefined) updates.assigneeId = input.assigneeId;
  if (input.teamId !== undefined) updates.teamId = input.teamId;
  if (input.snoozedUntil !== undefined) {
    updates.snoozedUntil = input.snoozedUntil;
    if (input.snoozedUntil) updates.status = 'snoozed';
  }

  const [updated] = await db
    .update(conversations)
    .set(updates)
    .where(eq(conversations.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await db.insert(events).values({
    type: 'conversation.updated',
    conversationId: id,
    userId: session.user.id,
    payload: { fields: input },
  });

  // Broadcast realtime update.
  const fields: Record<string, unknown> = {};
  if (input.status !== undefined) fields.status = input.status;
  if (input.assigneeId !== undefined) fields.assigneeId = input.assigneeId;
  if (input.teamId !== undefined) fields.teamId = input.teamId;
  if (input.priority !== undefined) fields.priority = input.priority;

  await redis.publish(
    REDIS_CHANNELS.socketBroadcast,
    JSON.stringify({
      room: SOCKET_ROOMS.conversation(id),
      event: 'conversation:updated',
      data: { conversationId: id, fields },
    }),
  );
  await redis.publish(
    REDIS_CHANNELS.socketBroadcast,
    JSON.stringify({
      room: SOCKET_ROOMS.all,
      event: 'conversation:updated',
      data: { conversationId: id, fields },
    }),
  );

  return NextResponse.json({ conversation: updated });
}
