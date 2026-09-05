import { Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { AdmissionsService } from './admissions.service.js';
import { QueryAdmissionsDto } from './dto/query-admissions.dto.js';

/**
 * The public intake calendar (1H-06). Everything here is readable without a
 * token — it is what a visitor plans around, and the reason the homepage
 * countdown can stop being marketing copy.
 *
 * Draft (`PLANNED`) rounds and unpublished schools never reach these payloads.
 */
@ApiTags('admissions')
@Public()
@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Open intake rounds across every published school, soonest deadline first' })
  findAll(@Query() query: QueryAdmissionsDto) {
    return this.admissions.findAll(query);
  }

  @Get('facets')
  @ApiOperation({ summary: 'Filter-panel facets (levels, months, years, regions)' })
  facets() {
    return this.admissions.facets();
  }

  @Get('calendar/:year')
  @ApiOperation({ summary: 'One year of rounds bucketed by intake month' })
  calendar(@Param('year', ParseIntPipe) year: number) {
    return this.admissions.calendar(year);
  }

  @Get('university/:universityId')
  @ApiOperation({ summary: 'Rounds at one school a new applicant could still join' })
  forUniversity(@Param('universityId', ParseUUIDPipe) universityId: string) {
    return this.admissions.selectableForUniversity(universityId);
  }
}
