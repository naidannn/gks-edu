import { Module } from '@nestjs/common';
import { DepartureController } from './departure.controller.js';
import { DepartureService } from './departure.service.js';

/** 1F-06/1F-07 — pre-departure preparation (gksedu.md §11). */
@Module({
  controllers: [DepartureController],
  providers: [DepartureService],
  exports: [DepartureService],
})
export class DepartureModule {}
