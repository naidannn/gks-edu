import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GKS_RANKING_QUEUE, PROGRAM_RESEARCH_QUEUE } from '../../queue/queue.constants.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { AdminProgramsController } from './admin-programs.controller.js';
import { AdminProgramsService } from './admin-programs.service.js';
import { AdminStudyFieldsController } from './admin-study-fields.controller.js';
import { ProgramsController } from './programs.controller.js';
import { ProgramsService } from './programs.service.js';
import { ProgramResearchProcessor } from './research/program-research.processor.js';
import { ProgramResearchService } from './research/program-research.service.js';
import { StudyFieldsService } from './study-fields.service.js';

/**
 * Programmes and tuition (ARCHITECTURE.md §3.3).
 *
 * A leaf on purpose: `UniversitiesModule` imports *this*, not the other way
 * round, so the catalogue detail page can keep editing programmes inline while
 * every write goes through one service. That is also why the ranking recompute
 * is queued here directly rather than through `GksRankingService` — injecting
 * it would make the dependency a cycle.
 *
 * `AdmissionsModule` is imported for `GeminiService` and `AdmissionConfigService`:
 * the research model is one admin setting for both searches, and two copies of
 * a Gemini client is how they drift apart.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: PROGRAM_RESEARCH_QUEUE }, { name: GKS_RANKING_QUEUE }),
    AdmissionsModule,
  ],
  controllers: [ProgramsController, AdminProgramsController, AdminStudyFieldsController],
  providers: [
    ProgramsService,
    AdminProgramsService,
    StudyFieldsService,
    ProgramResearchService,
    ProgramResearchProcessor,
  ],
  exports: [ProgramsService, AdminProgramsService, StudyFieldsService],
})
export class ProgramsModule {}
