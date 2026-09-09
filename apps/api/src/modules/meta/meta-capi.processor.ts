import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { META_CAPI_QUEUE } from '../../queue/queue.constants.js';
import { MetaCapiService, MetaPermanentError } from './meta-capi.service.js';
import type { MetaServerEvent } from './meta-capi.types.js';

/**
 * Delivers one already-hashed server event (1A-38). A transient failure throws
 * so BullMQ backs off and tries again; a rejection Meta will never accept is
 * turned into an `UnrecoverableError`, which fails the job at once instead of
 * spending five attempts proving the same point.
 */
@Processor(META_CAPI_QUEUE)
export class MetaCapiProcessor extends WorkerHost {
  private readonly logger = new Logger(MetaCapiProcessor.name);

  constructor(private readonly capi: MetaCapiService) {
    super();
  }

  async process(job: Job<{ event: MetaServerEvent }>): Promise<void> {
    const { event } = job.data;

    try {
      await this.capi.send([event]);
    } catch (error) {
      if (error instanceof MetaPermanentError) {
        this.logger.error(error.message);
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
