import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_QUEUES = new Set([
  'inbound',
  'outbound',
  'media',
  'bot',
  'campaign-dispatch',
  'campaign-send',
  'metrics',
  'retention',
  'email-poll',
  'history-sync',
]);

const ALLOWED_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const;
type State = (typeof ALLOWED_STATES)[number];

/**
 * GET /api/admin/queues/:queue/jobs?state=failed&limit=25
 *
 * Lists jobs in a single queue for inspection. Defaults to the most recent
 * 25 failed jobs since that's the most useful triage view.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ queue: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { queue } = await params;
  if (!ALLOWED_QUEUES.has(queue)) {
    return NextResponse.json({ error: 'unknown_queue' }, { status: 404 });
  }

  const url = new URL(req.url);
  const stateRaw = url.searchParams.get('state') ?? 'failed';
  const state = (ALLOWED_STATES as readonly string[]).includes(stateRaw)
    ? (stateRaw as State)
    : 'failed';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), 100);

  const q = new Queue(queue, { connection: redis });
  try {
    const jobs = await q.getJobs([state], 0, limit - 1);
    return NextResponse.json({
      queue,
      state,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        data: j.data,
        attemptsMade: j.attemptsMade,
        failedReason: j.failedReason,
        timestamp: j.timestamp,
        processedOn: j.processedOn,
        finishedOn: j.finishedOn,
      })),
    });
  } finally {
    await q.close();
  }
}
