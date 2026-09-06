import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueryProgramsDto } from './dto/query-programs.dto.js';
import { ProgramsService } from './programs.service.js';
import { StudyFieldsService } from './study-fields.service.js';

/**
 * The public programme catalogue: one subject, every school, tuition beside it.
 *
 * Everything here is `@Public()` and every payload is built from
 * `PROGRAM_CARD_FIELDS`, which has no `internalNote` and no `gksRank` in it —
 * our own ranking orders these lists without appearing in them
 * (ARCHITECTURE.md §3.1).
 */
@ApiTags('programs')
@Controller()
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly studyFields: StudyFieldsService,
  ) {}

  @Public()
  @Get('programs')
  @ApiOperation({ summary: 'Search programmes across every school, with tuition' })
  findAll(@Query() query: QueryProgramsDto) {
    return this.programs.findAll(query);
  }

  @Public()
  @Get('programs/facets')
  @ApiOperation({ summary: 'Filter-panel counts — levels, languages, regions, tuition range' })
  facets() {
    return this.programs.facets();
  }

  @Public()
  @Get('study-fields')
  @ApiOperation({ summary: 'The canonical subject taxonomy, groups with their subjects' })
  studyFieldTree() {
    return this.studyFields.publicTree();
  }
}
