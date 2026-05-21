import type { Job } from 'bullmq';
import { log } from '../logger';

export interface MediaJobData {
  channelId: string;
  messageId: string;
  providerMediaId: string;
}

export async function processMedia(job: Job<MediaJobData>) {
  log.info({ jobId: job.id, ...job.data }, 'media stub');
}
