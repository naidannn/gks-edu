import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { REPORT_REFRESH_QUEUE } from '../../queue/queue.constants.js';
import { ReportsController } from './reports.controller.js';
import { ReportsProcessor } from './reports.processor.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: REPORT_REFRESH_QUEUE })],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsProcessor],
  exports: [ReportsService],
})
export class ReportsModule {}
