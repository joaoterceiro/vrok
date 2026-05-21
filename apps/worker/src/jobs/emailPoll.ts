import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { Queue } from 'bullmq';
import { channels } from '@zora/db';
import { resolveEmailConfig } from '@zora/shared/channels';
import { db } from '../db';
import { log } from '../logger';
import { connection } from '../connection';

const inboundQueue = new Queue('inbound', { connection });

/**
 * Polled job — for each email channel, fetches new messages via IMAP and
 * enqueues IncomingEvents in the `inbound` queue. The shape mimics an adapter
 * webhook: we synthesize an event-like payload that the inbound worker can
 * consume.
 *
 * imapflow is heavy; we lazy-import to keep worker startup fast.
 */
export async function processEmailPoll(_job: Job): Promise<void> {
  const rows = await db.select().from(channels).where(eq(channels.type, 'email'));
  for (const ch of rows) {
    if (ch.status !== 'connected' && ch.status !== 'connecting') continue;
    try {
      const cfg = resolveEmailConfig(ch.config);
      const { ImapFlow } = (await import('imapflow')) as typeof import('imapflow');
      const client = new ImapFlow({
        host: cfg.imap.host,
        port: cfg.imap.port,
        secure: cfg.imap.secure,
        auth: { user: cfg.imap.user, pass: cfg.imap.password },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen('INBOX');

      // Fetch UNSEEN messages from the last 30 minutes.
      const since = new Date(Date.now() - 30 * 60_000);
      for await (const msg of client.fetch({ seen: false, since }, { source: true, envelope: true })) {
        const env = msg.envelope;
        const from = env?.from?.[0];
        if (!from?.address) continue;
        await inboundQueue.add(
          'email',
          {
            channelId: ch.id,
            payload: {
              __synthetic: true,
              source: 'email-poll',
              from: from.address,
              fromName: from.name,
              subject: env?.subject,
              date: env?.date,
              uid: msg.uid,
              messageId: env?.messageId,
              // body bytes are too heavy for redis — we ingest subject+from only here.
              // Phase 4+: parse MIME, upload attachments to MinIO.
            },
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 500 },
        );
        await client.messageFlagsAdd(msg.seq.toString(), ['\\Seen']);
      }
      await client.logout();
    } catch (err) {
      log.error({ channelId: ch.id, err: (err as Error).message }, 'emailPoll: failed');
    }
  }
}
