import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AI_INGEST_QUEUE } from '../../../queue/queue.constants.js';
import { IngestService, type IngestJobData } from './ingest.service.js';

/**
 * Runs one knowledge-ingest job (2A-05).
 *
 * Concurrency is two. The work is mostly waiting on Google's embedding endpoint,
 * but it is also the only thing in the system that can spend money in a loop, and
 * a "reindex everything" sweep over thirty handbooks should queue behind itself
 * rather than opening thirty concurrent billing taps.
 *
 * Unlike the research processor, a failure is rethrown: the ingest has already
 * recorded the reason on the document row, and BullMQ's retries are what get a
 * document indexed after a transient 429 from the embedder.
 */
@Processor(AI_INGEST_QUEUE, { concurrency: 2 })
export class IngestProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(private readonly ingest: IngestService) {
    super();
  }

  async process(job: Job<IngestJobData>): Promise<void> {
    const outcome = await this.ingest.execute(job.data.documentId);
    this.logger.log(`Мэдлэгийн баримт ${job.data.documentId}: ${outcome}`);
  }
}
