import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GKS_RANKING_QUEUE } from '../../queue/queue.constants.js';
import { AdminUniversitiesController } from './admin-universities.controller.js';
import { AdminUniversitiesService } from './admin-universities.service.js';
import { GksRankingProcessor } from './ranking/gks-ranking.processor.js';
import { GksRankingService } from './ranking/gks-ranking.service.js';
import { UniversitiesController } from './universities.controller.js';
import { UniversitiesService } from './universities.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: GKS_RANKING_QUEUE })],
  controllers: [UniversitiesController, AdminUniversitiesController],
  providers: [UniversitiesService, AdminUniversitiesService, GksRankingService, GksRankingProcessor],
  exports: [UniversitiesService, GksRankingService],
})
export class UniversitiesModule {}
