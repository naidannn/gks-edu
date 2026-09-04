import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  REPORT_REFRESH_INTERVAL_MS,
  REPORT_REFRESH_JOB,
  REPORT_REFRESH_QUEUE,
} from '../../queue/queue.constants.js';
import { ReportsService } from './reports.service.js';

/** Nightly `REFRESH MATERIALIZED VIEW` driver (1G-08). */
@Processor(REPORT_REFRESH_QUEUE)
export class ReportsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReportsProcessor.name);

  constructor(
    private readonly reports: ReportsService,
    @InjectQueue(REPORT_REFRESH_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(REPORT_REFRESH_JOB, { every: REPORT_REFRESH_INTERVAL_MS }, { data: {} });
  }

  async process(): Promise<void> {
    try {
      await this.reports.refreshViews();
    } catch (error) {
      this.logger.error(
        'Тайлангийн харагдац шинэчлэхэд алдаа гарлаа',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
