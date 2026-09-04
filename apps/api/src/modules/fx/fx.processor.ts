import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { type OnModuleInit } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { FX_RATE_INTERVAL_MS, FX_RATE_JOB, FX_RATE_QUEUE } from '../../queue/queue.constants.js';
import { FxService } from './fx.service.js';

/** 1E-07 — twice-daily pull so the invoice screen always has a fresh rate. */
@Processor(FX_RATE_QUEUE)
export class FxProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private readonly fx: FxService,
    @InjectQueue(FX_RATE_QUEUE) private readonly queue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    // `immediately` so a fresh deployment has today's rate without waiting out
    // the first interval — an invoice issued in that window would otherwise
    // fall back to the configured constant.
    await this.queue.upsertJobScheduler(FX_RATE_JOB, { every: FX_RATE_INTERVAL_MS, immediately: true }, { data: {} });
  }

  async process(): Promise<void> {
    // `refreshFromMongolbank` already swallows and logs its own failures.
    await this.fx.refreshFromMongolbank();
  }
}
