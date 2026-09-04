import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import { ReportsService } from './reports.service.js';

class MonthsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months: number = 12;
}

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: '§19-ийн удирдлагын хяналтын самбар (1G-09)' })
  dashboard() {
    return this.reports.dashboard();
  }

  @Get('sales-funnel')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Борлуулалтын юүлүүр: суваг, хөрвөлт (1B-11)' })
  salesFunnel(@Query() query: MonthsQueryDto) {
    return this.reports.salesFunnel(query.months);
  }

  @Get('finance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Санхүүгийн тайлан: орлого, авлага, буцаалт (1G-10)' })
  finance(@Query() query: MonthsQueryDto) {
    return this.reports.finance(query.months);
  }

  @Get('staff-performance')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ажилтны гүйцэтгэлийн тайлан (1G-11)' })
  staffPerformance() {
    return this.reports.staffPerformance();
  }

  @Get('document-progress')
  @Roles(...STAFF_ROLES, Role.DOC_OFFICER)
  @ApiOperation({ summary: 'Материалын явц, хугацаа хэтэрсэн хэрэг' })
  documentProgress() {
    return this.reports.documentProgress();
  }

  @Post('refresh')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Тайлангийн харагдацыг шууд шинэчлэх (1G-08)' })
  refresh() {
    return this.reports.refreshViews();
  }
}
