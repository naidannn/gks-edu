import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GKS_RANKING_QUEUE } from '../../queue/queue.constants.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { AdminUniversitiesController } from './admin-universities.controller.js';
import { AdminUniversitiesService } from './admin-universities.service.js';
import { GksRankingProcessor } from './ranking/gks-ranking.processor.js';
import { GksRankingService } from './ranking/gks-ranking.service.js';
import { UniversitiesController } from './universities.controller.js';
import { UniversitiesService } from './universities.service.js';

@Module({
  // The catalogue detail page edits intake rounds and programmes inline
  // (1A-27); the work itself belongs to `AdmissionsService` and
  // `AdminProgramsService`. The dependency runs this way round on purpose —
  // both of those modules are leaves, so neither can import this one back.
  imports: [BullModule.registerQueue({ name: GKS_RANKING_QUEUE }), AdmissionsModule, ProgramsModule],
  controllers: [UniversitiesController, AdminUniversitiesController],
  providers: [UniversitiesService, AdminUniversitiesService, GksRankingService, GksRankingProcessor],
  exports: [UniversitiesService, GksRankingService],
})
export class UniversitiesModule {}
