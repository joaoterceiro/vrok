import { publisher } from './connection';
import { REDIS_CHANNELS } from '@zora/shared';

/**
 * Publishes an event to be broadcast by the Socket.IO server (which listens on
 * the matching Redis channel and forwards to the right rooms).
 */
export async function publishSocketEvent<T = unknown>(payload: {
  room: string;
  event: string;
  data: T;
}) {
  await publisher.publish(REDIS_CHANNELS.socketBroadcast, JSON.stringify(payload));
}
