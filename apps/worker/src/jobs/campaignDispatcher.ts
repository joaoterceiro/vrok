import type { Job } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import {
  audienceContacts,
  campaigns,
  campaignMessages,
} from '@zora/db';
import { db } from '../db';
import { log } from '../logger';
import { queues } from '../queues';
import { publishSocketEvent } from '../publish';

export interface CampaignDispatchJobData {
  campaignId: string;
}

/**
 * Materializes the audience for a campaign and enqueues one campaign-send job
 * per recipient. Uses an idempotent unique index on (campaign_id, contact_id)
 * so re-runs don't create duplicates.
 */
export async function processCampaignDispatch(job: Job<CampaignDispatchJobData>) {
  const { campaignId } = job.data;

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) {
    log.warn({ campaignId }, 'dispatch: campaign not found');
    return;
  }
  if (campaign.status === 'canceled' || campaign.status === 'completed') {
    log.info({ campaignId, status: campaign.status }, 'dispatch: skip (terminal status)');
    return;
  }
  if (!campaign.audienceId) {
    log.warn({ campaignId }, 'dispatch: campaign has no audience');
    return;
  }

  await db
    .update(campaigns)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  const members = await db
    .select({ contactId: audienceContacts.contactId, variables: audienceContacts.variables })
    .from(audienceContacts)
    .where(eq(audienceContacts.audienceId, campaign.audienceId));

  let inserted = 0;
  let queued = 0;
  const rateLimitPerMin = Math.max(1, campaign.rateLimitPerMin ?? 20);
  const intervalMs = Math.ceil(60_000 / rateLimitPerMin);

  for (let i = 0; i < members.length; i++) {
    const m = members[i]!;
    const [row] = await db
      .insert(campaignMessages)
      .values({
        campaignId,
        contactId: m.contactId,
        status: 'pending',
        variablesResolved: m.variables ?? {},
      })
      .onConflictDoNothing({
        target: [campaignMessages.campaignId, campaignMessages.contactId],
      })
      .returning({ id: campaignMessages.id });

    if (row?.id) {
      inserted++;
      // Stagger jobs to respect per-campaign rate limit.
      await queues.campaignSend.add(
        'send',
        { campaignId, campaignMessageId: row.id },
        {
          delay: i * intervalMs,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 5000,
        },
      );
      queued++;
    }
  }

  await db
    .update(campaigns)
    .set({ totalRecipients: members.length, updatedAt: new Date() })
    .where(eq(campaigns.id, campaignId));

  await publishSocketEvent({
    room: 'all',
    event: 'campaign:progress',
    data: {
      campaignId,
      counters: { pending: queued, queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
      status: 'running',
    },
  });

  log.info({ campaignId, inserted, queued, total: members.length, rateLimitPerMin }, 'dispatch done');
}
