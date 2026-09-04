import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  DOCUMENT_REMINDER_INTERVAL_MS,
  DOCUMENT_REMINDER_JOB,
  DOCUMENT_REMINDER_QUEUE,
} from '../../queue/queue.constants.js';
import { DocumentRemindersService } from './document-reminders.service.js';

/**
 * Daily sweep behind 1D-12. The scheduler is upserted under a fixed key, so
 * every API instance boot converges on the same single repeatable job rather
 * than stacking one per process.
 */
@Processor(DOCUMENT_REMINDER_QUEUE)
export class DocumentRemindersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DocumentRemindersProcessor.name);

  constructor(
    private readonly reminders: DocumentRemindersService,
    @InjectQueue(DOCUMENT_REMINDER_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(DOCUMENT_REMINDER_JOB, { every: DOCUMENT_REMINDER_INTERVAL_MS }, { data: {} });
  }

  async process(): Promise<void> {
    try {
      await this.reminders.sweep();
    } catch (error) {
      this.logger.error('Материалын сануулга боловсруулахад алдаа гарлаа', error instanceof Error ? error.stack : String(error));
    }
  }
}
