import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { MARKETING_BATCH_DELAY_MS, MARKETING_QUEUE } from '../../queue/queue.constants.js';
import { CampaignsService } from './campaigns.service.js';

/**
 * Runs one batch of one campaign, then puts itself back in the queue if there
 * is more to do (1O).
 *
 * Batching rather than one long job: a campaign to a thousand addresses would
 * otherwise hold the worker — and Brevo's rate budget — for minutes while
 * everything else waits behind it, and a deploy in the middle would kill the
 * job somewhere nobody can see. Here the progress is in the recipient rows, so
 * whatever interrupts it, the next pass carries on from the same place.
 */
@Processor(MARKETING_QUEUE)
export class CampaignsProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignsProcessor.name);

  constructor(private readonly campaigns: CampaignsService) {
    super();
  }

  async process(job: Job<{ campaignId: string }>): Promise<void> {
    const { campaignId } = job.data;
    const { done, sent, failed } = await this.campaigns.sendBatch(campaignId);

    if (sent || failed) {
      this.logger.log(`Кампанит ажил ${campaignId}: ${sent} илгээв, ${failed} амжилтгүй`);
    }
    if (!done) await this.campaigns.enqueue(campaignId, MARKETING_BATCH_DELAY_MS);
  }
}
