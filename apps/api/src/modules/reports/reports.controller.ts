import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { DOC_STAFF_ROLES, STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import { ReportExportQueryDto, ReportQueryDto } from './dto/report-query.dto.js';
import {
  incomeCsv,
  intakeRiskCsv,
  outcomesCsv,
  receivablesCsv,
  staffCsv,
  stalledCasesCsv,
  type CsvFile,
} from './report-csv.js';
import type { ReportExport } from './report-types.js';
import { ReportsService } from './reports.service.js';

/**
 * Who may download what. One endpoint cannot carry two different `@Roles`, so a
 * CSV must not become the back door into a report the caller cannot open —
 * every export names the same audience its report does.
 */
const EXPORT_ROLES: Record<ReportExport, readonly Role[]> = {
  receivables: [Role.ADMIN],
  income: [Role.ADMIN],
  staff: [Role.ADMIN],
  outcomes: STAFF_ROLES,
  'stalled-cases': STAFF_ROLES,
  'intake-risk': DOC_STAFF_ROLES,
};

/**
 * `/reports/*` (1M).
 *
 * Every endpoint takes the same period query, so one date control on the screen
 * drives the whole set — except `intake-risk`, which is a countdown to a
 * deadline and belongs to no month.
 *
 * Money is admin-only: `finance` and the income/receivable exports. The
 * pipeline, outcomes and deadline reports are what consultants and document
 * officers need to do the day's work, so they carry the staff roles.
 */
@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('overview')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Удирдлагын тойм: урсгал ба одоогийн байдал (§19)' })
  overview(@Query() query: ReportQueryDto) {
    return this.reports.overview(query);
  }

  @Get('finance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Санхүү: орлого, дамжин өнгөрөх мөнгө, авлагын насжилт' })
  finance(@Query() query: ReportQueryDto) {
    return this.reports.financeReport(query);
  }

  @Get('pipeline')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Хэргийн юүлүүр: хөрвөлт, үе шатны хугацаа, гацсан хэрэг' })
  pipeline(@Query() query: ReportQueryDto) {
    return this.reports.pipelineReport(query);
  }

  @Get('outcomes')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Үр дүн: сургууль тус бүрийн элсэлт, визийн зөвшөөрлийн хувь' })
  outcomes(@Query() query: ReportQueryDto) {
    return this.reports.outcomesReport(query);
  }

  @Get('intake-risk')
  @Roles(...STAFF_ROLES, Role.DOC_OFFICER)
  @ApiOperation({ summary: 'Дотоод эцсийн хугацаанд амжихгүй эрсдэлтэй хэрэг (одоогийн байдлаар)' })
  intakeRisk(@Query() query: ReportQueryDto) {
    return this.reports.intakeRiskReport(query.horizonDays);
  }

  @Get('staff')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ажилтны гүйцэтгэл — сонгосон хугацаанд' })
  staff(@Query() query: ReportQueryDto) {
    return this.reports.staffReport(query);
  }

  /**
   * One CSV endpoint rather than six: the file always comes from a report the
   * screen has already shown, so the only thing that varies is which one.
   *
   * The route lets every staff role in; `EXPORT_ROLES` then decides which file
   * this caller may actually have.
   */
  @Get('export')
  @Roles(...DOC_STAFF_ROLES)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Тайланг CSV болгон татах (Excel-д зориулсан UTF-8 BOM-той)' })
  async export(
    @Query() query: ReportExportQueryDto,
    @Res({ passthrough: true }) response: Response,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<string> {
    const allowed = EXPORT_ROLES[query.report];
    if (!allowed.includes(user.role)) throw new ForbiddenException('Энэ тайланг татах эрхгүй байна');

    const file = await this.buildExport(query, query.report);
    // Without this the CSV opens inline in the API's own domain (task 0-21).
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return file.content;
  }

  @Post('refresh')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Тайлангийн кэшийг хаяж, дараагийн уншилтыг шууд тооцоолуулах' })
  refresh() {
    return this.reports.invalidate();
  }

  private async buildExport(query: ReportQueryDto, report: ReportExport): Promise<CsvFile> {
    switch (report) {
      case 'receivables':
        return receivablesCsv(await this.reports.financeReport(query));
      case 'income':
        return incomeCsv(await this.reports.financeReport(query));
      case 'outcomes':
        return outcomesCsv(await this.reports.outcomesReport(query));
      case 'staff':
        return staffCsv(await this.reports.staffReport(query));
      case 'intake-risk':
        return intakeRiskCsv(await this.reports.intakeRiskReport(query.horizonDays));
      case 'stalled-cases':
        return stalledCasesCsv(await this.reports.pipelineReport(query));
    }
  }
}
