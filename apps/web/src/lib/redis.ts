import IORedis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error('REDIS_URL is not set');
}

const globalForRedis = globalThis as unknown as {
  __zoraRedis?: IORedis;
  __zoraRedisSub?: IORedis;
};

/**
 * Shared Redis client for app-level cache and BullMQ producers.
 * BullMQ requires `maxRetriesPerRequest: null` for workers, so we keep
 * the queue-side connections separate (see worker package).
 */
export const redis: IORedis =
  globalForRedis.__zoraRedis ??
  new IORedis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
  });

/** Dedicated subscriber for pub/sub. */
export const redisSub: IORedis =
  globalForRedis.__zoraRedisSub ?? redis.duplicate();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.__zoraRedis = redis;
  globalForRedis.__zoraRedisSub = redisSub;
}
