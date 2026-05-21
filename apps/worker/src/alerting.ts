import type { Job } from 'bullmq';
import { log } from './logger';

/**
 * Sends a Slack alert when a BullMQ job moves to `failed`. Activated by
 * setting `SLACK_ALERT_WEBHOOK` to an Incoming-Webhook URL. Without that
 * env var the function is a no-op so dev environments stay quiet.
 *
 * Rate-limited per (queue, error fingerprint) so a single retry storm
 * doesn't spam the channel.
 */

interface RateBucket {
  lastAlertAt: number;
  count: number;
}
const RATE: Map<string, RateBucket> = new Map();
const RATE_WINDOW_MS = 10 * 60_000;
const RATE_MAX = 1;

function shouldAlert(key: string): boolean {
  const now = Date.now();
  const bucket = RATE.get(key);
  if (!bucket || now - bucket.lastAlertAt > RATE_WINDOW_MS) {
    RATE.set(key, { lastAlertAt: now, count: 1 });
    return true;
  }
  bucket.count++;
  return bucket.count <= RATE_MAX;
}

export async function alertJobFailed(
  queueName: string,
  job: Job | undefined,
  err: Error,
): Promise<void> {
  const webhook = process.env.SLACK_ALERT_WEBHOOK;
  if (!webhook) return;

  const fingerprint = `${queueName}::${err.message.slice(0, 60)}`;
  if (!shouldAlert(fingerprint)) {
    return; // already alerted recently — silence the duplicates
  }

  const payload = {
    text: `⚠️ *${queueName}* job failed`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `Vrok: ${queueName} job failed` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Queue:*\n\`${queueName}\`` },
          { type: 'mrkdwn', text: `*Job ID:*\n\`${job?.id ?? 'unknown'}\`` },
          { type: 'mrkdwn', text: `*Attempts:*\n${job?.attemptsMade ?? 0}` },
          { type: 'mrkdwn', text: `*Env:*\n${process.env.NODE_ENV ?? 'dev'}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Erro:*\n\`\`\`${err.message.slice(0, 600)}\`\`\`` },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Próximo alerta deste tipo só daqui a ${Math.round(RATE_WINDOW_MS / 60_000)}min.`,
          },
        ],
      },
    ],
  };

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (e) {
    log.warn(
      { err: (e as Error).message, queue: queueName },
      'slack alert delivery failed',
    );
  }
}
