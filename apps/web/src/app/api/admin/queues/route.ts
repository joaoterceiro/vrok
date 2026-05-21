import { NextResponse } from 'next/server';
import { Queue } from 'bullmq';
import { redis } from '@/lib/redis';
import { requireSession } from '@/lib/api/guards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QUEUE_NAMES = [
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
];

/**
 * Admin-only — returns BullMQ queue snapshots: waiting / active / completed
 * / failed / delayed / paused counts per queue. Powers the /admin/queues UI.
 */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const queues = QUEUE_NAMES.map((name) => new Queue(name, { connection: redis }));
  try {
    const snapshots = await Promise.all(
      queues.map(async (q) => {
        const counts = await q.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
          'paused',
        );
        const isPaused = await q.isPaused();
        return {
          name: q.name,
          counts,
          paused: isPaused,
        };
      }),
    );
    return NextResponse.json({ queues: snapshots, timestamp: new Date().toISOString() });
  } finally {
    await Promise.all(queues.map((q) => q.close()));
  }
}
