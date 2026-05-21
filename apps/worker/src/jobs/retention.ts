import type { Job } from 'bullmq';
import { log } from '../logger';

export async function processRetention(job: Job) {
  log.info({ jobId: job.id }, 'retention stub');
}
