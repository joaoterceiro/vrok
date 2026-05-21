import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, channels } from '@zora/db';
import { requireSession } from '@/lib/api/guards';
import { queues } from '@/lib/queues';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const JOB_NAME = 'sync';
const STALE_AFTER_MS = 60_000; // a job that hasn't progressed in 60s is stale

/**
 * POST /api/channels/[id]/sync — (re)trigger a history import on an
 * Evolution channel. Resilient to stale state: if the channel is marked
 * `queued` or `syncing` but no BullMQ job is actually in-flight, we treat
 * it as dead and force a fresh enqueue.
 *
 * Body (optional): { incremental?: boolean }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const [channel] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  if (!channel) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (channel.type !== 'wa_evolution') {
    return NextResponse.json(
      { error: 'history sync is only supported for WhatsApp Evolution' },
      { status: 400 },
    );
  }
  if (channel.status !== 'connected') {
    return NextResponse.json(
      { error: 'channel is not connected — pair the instance first' },
      { status: 400 },
    );
  }

  const jobId = `history-sync-${id}`;
  const existing = await queues.historySync.getJob(jobId);
  const isActive = existing ? await existing.isActive() : false;

  // Block ONLY when a job is genuinely in-flight (Redis sees it active and
  // the worker touched it recently). Anything else — stuck `queued`,
  // orphan `syncing`, completed/failed leftover — gets cleared and reset.
  if (existing && isActive) {
    const processedRecently =
      existing.processedOn != null && Date.now() - existing.processedOn < STALE_AFTER_MS;
    if (processedRecently) {
      return NextResponse.json(
        {
          error: 'sync already running',
          syncStatus: channel.syncStatus,
          syncProgress: channel.syncProgress,
        },
        { status: 409 },
      );
    }
    // Active but no recent progress → kill the zombie.
    await existing.remove().catch(() => undefined);
  } else if (existing) {
    // Job exists but not active (waiting/delayed/completed/failed) — clear
    // it so the dedup key doesn't block our fresh enqueue.
    await existing.remove().catch(() => undefined);
  }

  const body = (await req.json().catch(() => ({}))) as { incremental?: boolean };

  await db
    .update(channels)
    .set({
      syncStatus: 'queued',
      syncError: null,
      syncStartedAt: null,
      syncCompletedAt: null,
    })
    .where(eq(channels.id, id));

  await queues.historySync.add(
    JOB_NAME,
    { channelId: id, incremental: body.incremental === true },
    {
      jobId,
      removeOnComplete: { count: 5 },
      removeOnFail: false,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  );

  return NextResponse.json({ ok: true, queued: true, forced: existing != null });
}
