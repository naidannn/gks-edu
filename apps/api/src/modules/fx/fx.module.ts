import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FX_RATE_QUEUE } from '../../queue/queue.constants.js';
import { FxController } from './fx.controller.js';
import { FxProcessor } from './fx.processor.js';
import { FxService } from './fx.service.js';

/** 1E-07 — daily currency rates. */
@Module({
  imports: [BullModule.registerQueue({ name: FX_RATE_QUEUE })],
  controllers: [FxController],
  providers: [FxService, FxProcessor],
  exports: [FxService],
})
export class FxModule {}
