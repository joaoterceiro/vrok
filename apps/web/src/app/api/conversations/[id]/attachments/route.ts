import { NextResponse } from 'next/server';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db, messages, attachments } from '@zora/db';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface MessageAttachmentRow {
  url?: string;
  mime?: string;
  filename?: string;
  size?: number;
  minioKey?: string;
}

/**
 * GET /api/conversations/:id/attachments
 *
 * Returns every media item shared in the thread, grouped by type. Reads from
 * `messages.attachments` jsonb (which the inbox always populates), not the
 * separate `attachments` table — the jsonb already carries the proxied URL
 * the UI can render directly.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const rows = await db
    .select({
      id: messages.id,
      contentType: messages.contentType,
      attachments: messages.attachments,
      body: messages.body,
      createdAt: messages.createdAt,
      direction: messages.direction,
    })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, id),
        ne(messages.contentType, 'text'),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(200);

  const grouped: Record<'image' | 'audio' | 'video' | 'document' | 'other', Array<{
    messageId: string;
    url: string;
    mime: string;
    filename?: string;
    size?: number;
    caption?: string | null;
    createdAt: string | Date;
    direction: 'in' | 'out';
  }>> = { image: [], audio: [], video: [], document: [], other: [] };

  for (const m of rows) {
    const list = (m.attachments ?? []) as MessageAttachmentRow[];
    for (const a of list) {
      if (!a.url || !a.mime) continue;
      const bucket = bucketFor(a.mime);
      grouped[bucket].push({
        messageId: m.id,
        url: a.url,
        mime: a.mime,
        filename: a.filename,
        size: a.size,
        caption: m.body,
        createdAt: m.createdAt as unknown as string,
        direction: m.direction,
      });
    }
  }

  return NextResponse.json({
    counts: {
      image: grouped.image.length,
      audio: grouped.audio.length,
      video: grouped.video.length,
      document: grouped.document.length,
      other: grouped.other.length,
    },
    items: grouped,
  });
}

function bucketFor(mime: string): 'image' | 'audio' | 'video' | 'document' | 'other' {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (
    m.startsWith('application/pdf') ||
    m.startsWith('application/msword') ||
    m.startsWith('application/vnd.') ||
    m.startsWith('text/')
  ) {
    return 'document';
  }
  return 'other';
}
