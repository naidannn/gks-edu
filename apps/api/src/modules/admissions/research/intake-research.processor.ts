import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { INTAKE_RESEARCH_QUEUE } from '../../../queue/queue.constants.js';
import { IntakeResearchService } from './intake-research.service.js';

/**
 * Runs one intake-date search (1H-10). On-demand, not scheduled — no
 * `upsertJobScheduler` here.
 *
 * `execute` records its own failures on the run row, so a job that finishes
 * quietly is the normal path even when the search did not work; the admin
 * screen reads the reason off the row.
 */
@Processor(INTAKE_RESEARCH_QUEUE, {
  // A grounded search is slow and rate-limited; one at a time per worker is
  // plenty for a button a handful of staff press.
  concurrency: 2,
})
export class IntakeResearchProcessor extends WorkerHost {
  private readonly logger = new Logger(IntakeResearchProcessor.name);

  constructor(private readonly research: IntakeResearchService) {
    super();
  }

  async process(job: Job<{ runId: string }>): Promise<void> {
    try {
      await this.research.execute(job.data.runId);
    } catch (error) {
      this.logger.error(
        `Элсэлтийн судалгааны ажил амжилтгүй боллоо (${job.data.runId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
