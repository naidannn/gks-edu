import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  QPAY_SWEEP_INTERVAL_MS,
  QPAY_SWEEP_JOB,
  QPAY_SWEEP_QUEUE,
} from '../../queue/queue.constants.js';
import { PaymentsService } from './payments.service.js';

/**
 * The slow half of the QPay polling fallback (1C-38).
 *
 * An unpaid invoice lives a day, and `QpayPollingProcessor` only watches the
 * first fifteen minutes of it. This one picks up everything still open after
 * that and retires what has run out. The scheduler is upserted under a fixed
 * key so every API instance converges on one repeatable job instead of stacking
 * one each — the same arrangement `ReminderSweepsProcessor` uses.
 */
@Processor(QPAY_SWEEP_QUEUE)
export class QpaySweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(QpaySweepProcessor.name);

  constructor(
    private readonly payments: PaymentsService,
    @InjectQueue(QPAY_SWEEP_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(QPAY_SWEEP_JOB, { every: QPAY_SWEEP_INTERVAL_MS }, { data: {} });
  }

  async process(): Promise<void> {
    try {
      await this.payments.sweepOpenInvoices();
    } catch (error) {
      this.logger.error(
        'Нээлттэй QPay нэхэмжлэхүүдийг шалгах үед алдаа гарлаа',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
