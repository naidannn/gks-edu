import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { QPAY_POLL_QUEUE } from '../../queue/queue.constants.js';
import { PaymentsService } from './payments.service.js';

/** 1C-14 — fallback for a missed/delayed QPay webhook; the job self-cancels once `PaymentsService.pollOnce` sees a non-PENDING status. */
@Processor(QPAY_POLL_QUEUE)
export class QpayPollingProcessor extends WorkerHost {
  private readonly logger = new Logger(QpayPollingProcessor.name);

  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<{ paymentId: string }>): Promise<void> {
    try {
      await this.payments.pollOnce(job.data.paymentId);
    } catch (error) {
      this.logger.error(`QPay poll failed for payment ${job.data.paymentId}`, error instanceof Error ? error.stack : String(error));
    }
  }
}
