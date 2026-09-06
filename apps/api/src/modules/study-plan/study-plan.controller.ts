import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueryStudyPlanDto } from './dto/query-study-plan.dto.js';
import { StudyPlanService } from './study-plan.service.js';

/**
 * Суралцах төлөвлөгөө (1J-04, ARCHITECTURE.md §3.4).
 *
 * One public endpoint, and a `GET` on purpose: the answer is then a link a
 * visitor can reload and a consultant can send. Nothing is stored — the plan is
 * entirely a function of the query, and the visitor's own copy of it is the URL.
 */
@ApiTags('study-plan')
@Public()
@Controller('study-plan')
export class StudyPlanController {
  constructor(private readonly studyPlan: StudyPlanService) {}

  @Get()
  @ApiOperation({ summary: 'When could this person go, where could they study, and what does year one cost' })
  build(@Query() query: QueryStudyPlanDto) {
    return this.studyPlan.build(query);
  }
}
