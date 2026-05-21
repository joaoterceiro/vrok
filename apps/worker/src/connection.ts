import IORedis from 'ioredis';

const url = process.env.REDIS_URL;
if (!url) {
  throw new Error('REDIS_URL is not set');
}

// Workers in BullMQ require these settings.
export const connection = new IORedis(url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const publisher = connection.duplicate();
