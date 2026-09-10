import { Module } from '@nestjs/common';
import { FinanceReportService } from './finance-report.service.js';
import { IntakeRiskReportService } from './intake-risk-report.service.js';
import { OutcomesReportService } from './outcomes-report.service.js';
import { PipelineReportService } from './pipeline-report.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { StaffReportService } from './staff-report.service.js';

/**
 * Reporting (1M). One service per report, all of them reading live rows and
 * memoised for a few minutes in Redis — there is no nightly job here any more
 * (see the note at the top of `reports.service.ts`).
 */
@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    FinanceReportService,
    PipelineReportService,
    OutcomesReportService,
    IntakeRiskReportService,
    StaffReportService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
