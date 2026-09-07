import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { INTAKE_RESEARCH_QUEUE } from '../../queue/queue.constants.js';
import { AdmissionConfigService } from './admission-config.service.js';
import { AdminAdmissionsController } from './admin-admissions.controller.js';
import { AdmissionsBoardService } from './admissions-board.service.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';
import { DeepseekService } from './research/deepseek.service.js';
import { GeminiService } from './research/gemini.service.js';
import { IntakeResearchProcessor } from './research/intake-research.processor.js';
import { IntakeResearchService } from './research/intake-research.service.js';

/**
 * The intake calendar (1H — gksedu.md §4.1, §4.2).
 *
 * `AdmissionsService` is exported because the case modules need it: pointing a
 * case at a round has to be validated against the calendar, and that check has
 * exactly one home.
 */
@Module({
  imports: [BullModule.registerQueue({ name: INTAKE_RESEARCH_QUEUE })],
  controllers: [AdmissionsController, AdminAdmissionsController],
  providers: [
    AdmissionsService,
    AdmissionConfigService,
    AdmissionsBoardService,
    GeminiService,
    DeepseekService,
    IntakeResearchService,
    IntakeResearchProcessor,
  ],
  // Both clients are exported for the programme-research search: which one
  // answers is decided there by the configured model name — see `ProgramsModule`.
  exports: [AdmissionsService, AdmissionConfigService, AdmissionsBoardService, GeminiService, DeepseekService],
})
export class AdmissionsModule {}
