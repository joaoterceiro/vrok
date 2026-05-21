import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, conversations, messages, notes, attachments as attachmentsTable } from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { queues } from '@/lib/queues';
import { redis } from '@/lib/redis';
import { REDIS_CHANNELS, SOCKET_ROOMS } from '@zora/shared';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const attachmentSchema = z.object({
  url: z.string().min(1),
  minioKey: z.string().min(1).optional(),
  mime: z.string().min(1),
  size: z.number().int().nonnegative().optional(),
  filename: z.string().max(255).optional(),
});

const bodySchema = z
  .object({
    body: z.string().max(4096).optional(),
    isNote: z.boolean().optional().default(false),
    attachments: z.array(attachmentSchema).max(10).optional(),
  })
  .refine(
    (v) => (v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0),
    'either body or attachments is required',
  );

function contentTypeFromAttachments(att: Array<{ mime: string }>): typeof messages.$inferInsert.contentType {
  if (att.length === 0) return 'text';
  const m = att[0]!.mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  return 'document';
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const { body, isNote, attachments = [] } = parsed.data;

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!conv) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Internal note — always text, no attachments.
  if (isNote && body) {
    const [note] = await db
      .insert(notes)
      .values({ conversationId: id, userId: session.user.id, body })
      .returning();
    await redis.publish(
      REDIS_CHANNELS.socketBroadcast,
      JSON.stringify({
        room: SOCKET_ROOMS.conversation(id),
        event: 'note:new',
        data: { conversationId: id, noteId: note?.id, body },
      }),
    );
    return NextResponse.json({ note });
  }

  const contentType = contentTypeFromAttachments(attachments);
  const messageId = randomUUID();

  const [created] = await db
    .insert(messages)
    .values({
      id: messageId,
      conversationId: id,
      direction: 'out',
      sender: 'user',
      userId: session.user.id,
      contentType,
      body: body ?? null,
      attachments: attachments.map((a) => ({
        url: a.url,
        // Keep the MinIO key so the outbound worker can build a direct,
        // provider-reachable URL without going through the auth-gated proxy.
        minioKey: a.minioKey,
        mime: a.mime,
        filename: a.filename,
        size: a.size,
      })),
      status: 'queued',
    })
    .returning();

  // Persist attachment rows too (for retention/queries).
  for (const a of attachments) {
    if (!a.minioKey) continue;
    await db.insert(attachmentsTable).values({
      messageId,
      minioKey: a.minioKey,
      mime: a.mime,
      size: a.size ?? null,
      originalFilename: a.filename ?? null,
    });
  }

  const preview =
    body && body.length > 0
      ? body.slice(0, 280)
      : attachmentLabel(contentType);

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date(), lastMessagePreview: preview, updatedAt: new Date() })
    .where(eq(conversations.id, id));

  // Optimistic socket event so the sender's UI updates immediately.
  await redis.publish(
    REDIS_CHANNELS.socketBroadcast,
    JSON.stringify({
      room: SOCKET_ROOMS.conversation(id),
      event: 'message:new',
      data: {
        conversationId: id,
        messageId,
        direction: 'out',
        contentType,
        body: body ?? null,
        sender: 'user',
        attachments,
        createdAt: (created?.createdAt ?? new Date()).toISOString(),
      },
    }),
  );

  // Worker calls the provider API.
  await queues.outbound.add(
    'send',
    { messageId },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: false,
    },
  );

  return NextResponse.json({ message: created });
}

function attachmentLabel(t: typeof messages.$inferInsert.contentType): string {
  if (t === 'image') return '📷 Imagem';
  if (t === 'audio') return '🎤 Áudio';
  if (t === 'video') return '🎬 Vídeo';
  if (t === 'document') return '📎 Documento';
  return '';
}
