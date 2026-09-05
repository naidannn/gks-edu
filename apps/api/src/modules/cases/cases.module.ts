import { Module } from '@nestjs/common';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { CasesController } from './cases.controller.js';
import { CasesService } from './cases.service.js';

@Module({
  // Pointing a case at an intake round is validated against the calendar (1H-07).
  imports: [AdmissionsModule],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
