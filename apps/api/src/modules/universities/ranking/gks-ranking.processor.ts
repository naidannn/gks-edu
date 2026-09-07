import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import {
  GKS_RANKING_INTERVAL_MS,
  GKS_RANKING_JOB,
  GKS_RANKING_QUEUE,
} from '../../../queue/queue.constants.js';
import { GksRankingService } from './gks-ranking.service.js';

/**
 * 1A-30 — keeps `gksRank` current.
 *
 * Two of the five components (demand, practical) move on their own as users
 * save schools and cases are decided, so the ranking is not something an admin
 * edit alone can keep fresh. One scheduled run a day, plus the ad-hoc job
 * `GksRankingService.scheduleRecompute()` queues after a catalogue edit.
 */
@Processor(GKS_RANKING_QUEUE)
export class GksRankingProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(GksRankingProcessor.name);

  constructor(
    private readonly ranking: GksRankingService,
    @InjectQueue(GKS_RANKING_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // `immediately` so a fresh deployment — or the first boot after the columns
    // were added — has a ranking rather than an all-null default order.
    await this.queue.upsertJobScheduler(
      GKS_RANKING_JOB,
      { every: GKS_RANKING_INTERVAL_MS, immediately: true },
      { data: {} },
    );
  }

  async process(): Promise<void> {
    try {
      await this.ranking.recompute();
    } catch (error) {
      // A failed run leaves the previous ranking in place, which is a fine
      // fallback — the catalogue stays ordered, just a day stale.
      this.logger.error(`GKS рэйтинг дахин тооцоолоход алдаа гарлаа: ${(error as Error).message}`);
    }
  }
}
