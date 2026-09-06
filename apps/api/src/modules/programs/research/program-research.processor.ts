import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PROGRAM_RESEARCH_QUEUE } from '../../../queue/queue.constants.js';
import { ProgramResearchService } from './program-research.service.js';

/**
 * Runs one programme/tuition search. On-demand, not scheduled — no
 * `upsertJobScheduler` here.
 *
 * `execute` records its own failures on the run row, so a job that finishes
 * quietly is the normal path even when the search did not work; the admin
 * screen reads the reason off the row.
 */
@Processor(PROGRAM_RESEARCH_QUEUE, {
  // A grounded search is slow and rate-limited; two at a time per worker is
  // plenty for a button a handful of staff press.
  concurrency: 2,
})
export class ProgramResearchProcessor extends WorkerHost {
  private readonly logger = new Logger(ProgramResearchProcessor.name);

  constructor(private readonly research: ProgramResearchService) {
    super();
  }

  async process(job: Job<{ runId: string }>): Promise<void> {
    try {
      await this.research.execute(job.data.runId);
    } catch (error) {
      this.logger.error(
        `Хөтөлбөрийн судалгааны ажил амжилтгүй боллоо (${job.data.runId})`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
