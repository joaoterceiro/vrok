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

/**
 * POST /api/admin/queues/:queue/jobs/:id/retry — retry a failed job.
 * DELETE same path → remove the job. Admin-only.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ queue: string; id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { queue, id } = await params;
  if (!ALLOWED_QUEUES.has(queue)) {
    return NextResponse.json({ error: 'unknown_queue' }, { status: 404 });
  }

  const q = new Queue(queue, { connection: redis });
  try {
    const job = await q.getJob(id);
    if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await job.retry();
    return NextResponse.json({ ok: true });
  } finally {
    await q.close();
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ queue: string; id: string }> },
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const { queue, id } = await params;
  if (!ALLOWED_QUEUES.has(queue)) {
    return NextResponse.json({ error: 'unknown_queue' }, { status: 404 });
  }

  const q = new Queue(queue, { connection: redis });
  try {
    const job = await q.getJob(id);
    if (!job) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    await job.remove();
    return NextResponse.json({ ok: true });
  } finally {
    await q.close();
  }
}
