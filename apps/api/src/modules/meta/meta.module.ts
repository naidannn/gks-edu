import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { META_CAPI_QUEUE } from '../../queue/queue.constants.js';
import { MetaCapiProcessor } from './meta-capi.processor.js';
import { MetaCapiService } from './meta-capi.service.js';
import { MetaController } from './meta.controller.js';
import { MetaEventsService } from './meta-events.service.js';

/**
 * Global for the same reason `NotificationsModule` is: conversions happen in
 * leads, auth and payments, and threading an import through each of them buys
 * nothing (1A-38).
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: META_CAPI_QUEUE })],
  controllers: [MetaController],
  providers: [MetaCapiService, MetaEventsService, MetaCapiProcessor],
  exports: [MetaEventsService, MetaCapiService],
})
export class MetaModule {}
