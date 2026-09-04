import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  REMINDER_SWEEP_INTERVAL_MS,
  REMINDER_SWEEP_JOB,
  REMINDER_SWEEP_QUEUE,
} from '../../queue/queue.constants.js';
import { ReminderSweepsService } from './reminder-sweeps.service.js';

/**
 * Daily driver for 1G-07. The scheduler is upserted under a fixed key so every
 * API instance converges on one repeatable job instead of stacking one each.
 */
@Processor(REMINDER_SWEEP_QUEUE)
export class ReminderSweepsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReminderSweepsProcessor.name);

  constructor(
    private readonly sweeps: ReminderSweepsService,
    @InjectQueue(REMINDER_SWEEP_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(REMINDER_SWEEP_JOB, { every: REMINDER_SWEEP_INTERVAL_MS }, { data: {} });
  }

  async process(): Promise<void> {
    try {
      await this.sweeps.sweepAll();
    } catch (error) {
      this.logger.error(
        'Хуваарьт сануулга боловсруулахад алдаа гарлаа',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
