import { Worker, Queue } from 'bullmq';
import { connection } from './connection';
import { log } from './logger';
import { ensureBucket } from './minio';
import { processInbound } from './jobs/inboundMessage';
import { processOutbound } from './jobs/outboundMessage';
import { processMedia } from './jobs/downloadMedia';
import { processAgent } from './jobs/runAgent';
import { processCampaignDispatch } from './jobs/campaignDispatcher';
import { processCampaignSend } from './jobs/campaignSend';
import { processMetrics } from './jobs/computeMetrics';
import { processRetention } from './jobs/retention';
import { processEmailPoll } from './jobs/emailPoll';
import { processHistorySync } from './jobs/historySync';

await ensureBucket().catch((err: unknown) =>
  log.warn({ err: (err as Error).message }, 'failed to ensure MinIO bucket'),
);

// Boot recovery — any channel marked `queued`/`syncing` with no BullMQ job
// alive is a leftover from a previous worker crash. Flip them to `error`
// with a hint so the UI re-enables the Sincronizar button.
import('./jobs/historySync').then(async () => {
  const { Queue } = await import('bullmq');
  const { db } = await import('./db');
  const { channels } = await import('@zora/db');
  const { sql, eq } = await import('drizzle-orm');
  const q = new Queue('history-sync', { connection });
  try {
    const stuck = await db
      .select({ id: channels.id, syncStatus: channels.syncStatus })
      .from(channels)
      .where(sql`${channels.syncStatus} IN ('queued','syncing')`);
    for (const c of stuck) {
      const job = await q.getJob(`history-sync-${c.id}`);
      const active = job ? await job.isActive() : false;
      if (!active) {
        if (job) await job.remove().catch(() => undefined);
        await db
          .update(channels)
          .set({
            syncStatus: 'error',
            syncError: 'Worker reiniciou durante a sincronização — clique em Sincronizar para tentar de novo',
            updatedAt: new Date(),
          })
          .where(eq(channels.id, c.id));
        log.warn(
          { channelId: c.id, previousStatus: c.syncStatus },
          'boot recovery: reset orphan history-sync state',
        );
      }
    }
  } finally {
    await q.close();
  }
}).catch((err: unknown) =>
  log.warn({ err: (err as Error).message }, 'history-sync boot recovery skipped'),
);

// Schedule recurring metrics aggregation (every 5 minutes).
import('./queues').then(({ queues }) =>
  queues.metrics.add(
    'tick',
    {},
    { repeat: { every: 5 * 60_000 }, removeOnComplete: 10, removeOnFail: 10 },
  ),
).catch((err: unknown) => log.warn({ err: (err as Error).message }, 'failed to schedule metrics'));

// Schedule email IMAP polling every 2 minutes.
const emailQueue = new Queue('email-poll', { connection });
await emailQueue.upsertJobScheduler(
  'email-poll-tick',
  { every: 120_000 },
  { name: 'tick', data: {} },
);

const workers = [
  new Worker('inbound', processInbound, { connection, concurrency: 20 }),
  new Worker('outbound', processOutbound, { connection, concurrency: 10 }),
  new Worker('media', processMedia, { connection, concurrency: 5 }),
  new Worker('bot', processAgent, { connection, concurrency: 5 }),
  new Worker('campaign-dispatch', processCampaignDispatch, { connection, concurrency: 2 }),
  new Worker('campaign-send', processCampaignSend, {
    connection,
    concurrency: 10,
    limiter: { max: 20, duration: 60_000 }, // safe default; per-campaign override applied via job opts
  }),
  new Worker('metrics', processMetrics, { connection, concurrency: 1 }),
  new Worker('retention', processRetention, { connection, concurrency: 1 }),
  new Worker('email-poll', processEmailPoll, { connection, concurrency: 1 }),
  // history-sync: 2 jobs in parallel max (heavy I/O against Evolution).
  new Worker('history-sync', processHistorySync, {
    connection,
    concurrency: 2,
    // Long jobs: don't stall the worker shutdown indefinitely.
    lockDuration: 5 * 60_000,
    stalledInterval: 30_000,
  }),
];

const { alertJobFailed } = await import('./alerting');

for (const w of workers) {
  w.on('ready', () => log.info({ queue: w.name }, 'worker ready'));
  w.on('failed', (job, err) => {
    log.error({ queue: w.name, jobId: job?.id, err: err.message }, 'job failed');
    // Only alert when BullMQ won't retry any more — avoids storming the
    // Slack channel during transient outages.
    const maxAttempts = (job?.opts?.attempts as number | undefined) ?? 1;
    const terminal = (job?.attemptsMade ?? 0) >= maxAttempts;
    if (terminal) {
      void alertJobFailed(w.name, job, err);
    }
  });
  w.on('error', (err) => log.error({ queue: w.name, err: err.message }, 'worker error'));
}

const shutdown = async (signal: string) => {
  log.info({ signal }, 'shutting down workers');
  await Promise.all(workers.map((w) => w.close()));
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

log.info('Zora workers running');
