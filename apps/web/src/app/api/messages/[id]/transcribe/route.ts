import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import {
  db,
  messages as messagesTable,
  attachments as attachmentsTable,
} from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { transcribeAudio, type TranscriptResult } from '@/lib/transcribe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/messages/:id/transcribe[?force=1]
 *
 * Manually transcribe a single audio message. Returns the cached result
 * when one exists unless `force=1` is passed. Stores the transcript on
 * `messages.metadata.transcript`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const force = new URL(req.url).searchParams.get('force') === '1';

  const [msg] = await db
    .select({
      id: messagesTable.id,
      contentType: messagesTable.contentType,
      metadata: messagesTable.metadata,
    })
    .from(messagesTable)
    .where(eq(messagesTable.id, id))
    .limit(1);
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (msg.contentType !== 'audio') {
    return NextResponse.json(
      { error: 'not_audio', detail: `Mensagem é ${msg.contentType}, não áudio` },
      { status: 400 },
    );
  }

  const cached = (msg.metadata as Record<string, unknown>)?.transcript as
    | TranscriptResult
    | undefined;
  if (cached?.text && !force) {
    return NextResponse.json({ transcript: cached, cached: true });
  }

  const [att] = await db
    .select({ minioKey: attachmentsTable.minioKey, mime: attachmentsTable.mime })
    .from(attachmentsTable)
    .where(eq(attachmentsTable.messageId, id))
    .limit(1);
  if (!att) {
    return NextResponse.json(
      { error: 'no_attachment', detail: 'Mensagem de áudio sem arquivo anexado' },
      { status: 400 },
    );
  }

  let result: TranscriptResult;
  try {
    result = await transcribeAudio(att.minioKey, att.mime);
  } catch (err) {
    return NextResponse.json(
      { error: 'transcribe_failed', detail: (err as Error).message },
      { status: 502 },
    );
  }

  await db
    .update(messagesTable)
    .set({
      metadata: sql`COALESCE(${messagesTable.metadata}, '{}'::jsonb) || ${JSON.stringify({ transcript: result })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(messagesTable.id, id));

  return NextResponse.json({ transcript: result, cached: false });
}

/**
 * GET /api/messages/:id/transcribe — returns the cached transcript only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const [msg] = await db
    .select({ metadata: messagesTable.metadata, contentType: messagesTable.contentType })
    .from(messagesTable)
    .where(and(eq(messagesTable.id, id), eq(messagesTable.contentType, 'audio')))
    .limit(1);
  if (!msg) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cached = (msg.metadata as Record<string, unknown>)?.transcript as
    | TranscriptResult
    | undefined;
  return NextResponse.json({ transcript: cached ?? null });
}
