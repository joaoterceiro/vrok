import pino, { type Logger } from 'pino';
import { randomUUID } from 'node:crypto';

export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l' } }
      : undefined,
});

/**
 * Returns a child logger that tags every line with a correlation id and any
 * extra ctx (queue, jobId, channelId). Use one per job so logs from a single
 * unit of work can be filtered together.
 *
 * Example:
 *   const jlog = jobLogger('history-sync', job.id, { channelId });
 *   jlog.info({ contactsImported: 10 }, 'progress');
 */
export function jobLogger(
  queue: string,
  jobId: string | undefined,
  extra: Record<string, unknown> = {},
): Logger {
  return log.child({
    correlationId: jobId ?? randomUUID(),
    queue,
    ...extra,
  });
}
