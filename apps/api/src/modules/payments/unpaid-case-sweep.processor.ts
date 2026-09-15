import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  UNPAID_CASE_SWEEP_INTERVAL_MS,
  UNPAID_CASE_SWEEP_JOB,
  UNPAID_CASE_SWEEP_QUEUE,
} from '../../queue/queue.constants.js';
import { UnpaidCaseSweepService } from './unpaid-case-sweep.service.js';

/**
 * Hourly driver for 1C-43. Upserted under a fixed key so every API instance
 * converges on one repeatable job — the same arrangement as the QPay sweep.
 */
@Processor(UNPAID_CASE_SWEEP_QUEUE)
export class UnpaidCaseSweepProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(UnpaidCaseSweepProcessor.name);

  constructor(
    private readonly sweeps: UnpaidCaseSweepService,
    @InjectQueue(UNPAID_CASE_SWEEP_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(UNPAID_CASE_SWEEP_JOB, { every: UNPAID_CASE_SWEEP_INTERVAL_MS }, { data: {} });
  }

  async process(): Promise<void> {
    try {
      await this.sweeps.sweep();
    } catch (error) {
      this.logger.error(
        'Төлбөргүй үйлчилгээ цуцлах үед алдаа гарлаа',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
