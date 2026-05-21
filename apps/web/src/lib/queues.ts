import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error('REDIS_URL is not set');
}

// BullMQ producers can share a connection. Workers (in apps/worker) use their own.
const globalForQueues = globalThis as unknown as { __zoraQueueConn?: IORedis };
const connection: IORedis =
  globalForQueues.__zoraQueueConn ??
  new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false });

if (process.env.NODE_ENV !== 'production') {
  globalForQueues.__zoraQueueConn = connection;
}

export const QUEUE_NAMES = {
  inbound: 'inbound',
  outbound: 'outbound',
  media: 'media',
  bot: 'bot',
  campaignDispatch: 'campaign-dispatch',
  campaignSend: 'campaign-send',
  metrics: 'metrics',
  retention: 'retention',
  historySync: 'history-sync',
} as const;

export const queues = {
  inbound: new Queue(QUEUE_NAMES.inbound, { connection }),
  outbound: new Queue(QUEUE_NAMES.outbound, { connection }),
  media: new Queue(QUEUE_NAMES.media, { connection }),
  bot: new Queue(QUEUE_NAMES.bot, { connection }),
  campaignDispatch: new Queue(QUEUE_NAMES.campaignDispatch, { connection }),
  campaignSend: new Queue(QUEUE_NAMES.campaignSend, { connection }),
  metrics: new Queue(QUEUE_NAMES.metrics, { connection }),
  retention: new Queue(QUEUE_NAMES.retention, { connection }),
  historySync: new Queue(QUEUE_NAMES.historySync, { connection }),
};
