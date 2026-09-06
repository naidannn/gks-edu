import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { FxModule } from '../fx/fx.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ProgramsModule } from '../programs/programs.module.js';
import { StudyPlanController } from './study-plan.controller.js';
import { StudyPlanService } from './study-plan.service.js';

/**
 * The study planner (ARCHITECTURE.md §3.4).
 *
 * A leaf that owns no tables of its own: it reads the intake calendar, the
 * programme catalogue, `ServicePricing` and today's rate, and composes them
 * into one answer. Nothing imports it back, so the four dependencies below
 * cannot become a cycle.
 */
@Module({
  imports: [AdmissionsModule, ProgramsModule, PricingModule, FxModule],
  controllers: [StudyPlanController],
  providers: [StudyPlanService],
})
export class StudyPlanModule {}
