import { Queue } from 'bullmq';
import { connection } from './connection';

const globalForQueues = globalThis as unknown as { __zoraWorkerQueues?: Queues };

interface Queues {
  inbound: Queue;
  outbound: Queue;
  media: Queue;
  bot: Queue;
  campaignDispatch: Queue;
  campaignSend: Queue;
  metrics: Queue;
  retention: Queue;
  historySync: Queue;
}

/**
 * Default job options applied to every queue:
 *  - `removeOnComplete: { count: 500 }`: keep last 500 successes for audit
 *  - `removeOnFail: { count: 1000 }`: keep failures for DLQ inspection
 *  - `attempts: 3` + exponential backoff
 */
const defaultJobOpts = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1000 },
};

function build(): Queues {
  return {
    inbound: new Queue('inbound', { connection, defaultJobOptions: defaultJobOpts }),
    outbound: new Queue('outbound', { connection, defaultJobOptions: defaultJobOpts }),
    media: new Queue('media', { connection, defaultJobOptions: defaultJobOpts }),
    bot: new Queue('bot', { connection, defaultJobOptions: defaultJobOpts }),
    campaignDispatch: new Queue('campaign-dispatch', {
      connection,
      defaultJobOptions: defaultJobOpts,
    }),
    campaignSend: new Queue('campaign-send', { connection, defaultJobOptions: defaultJobOpts }),
    metrics: new Queue('metrics', { connection, defaultJobOptions: defaultJobOpts }),
    retention: new Queue('retention', { connection, defaultJobOptions: defaultJobOpts }),
    // history-sync runs longer and is single-tenant per channel — give it
    // its own limits so a stuck import doesn't fill the cache.
    historySync: new Queue('history-sync', {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential' as const, delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 500 },
      },
    }),
  };
}

export const queues: Queues = globalForQueues.__zoraWorkerQueues ?? build();
if (process.env.NODE_ENV !== 'production') {
  globalForQueues.__zoraWorkerQueues = queues;
}
