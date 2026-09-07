import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueryProgramsDto } from './dto/query-programs.dto.js';
import { ProgramsService } from './programs.service.js';

/**
 * The public programme catalogue: every department, searched by word.
 *
 * Everything here is `@Public()` and every payload is built from
 * `PROGRAM_CARD_FIELDS`, which has no `internalNote` and no `gksRank` in it —
 * our own ranking orders these lists without appearing in them
 * (ARCHITECTURE.md §3.1).
 */
@ApiTags('programs')
@Controller()
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Public()
  @Get('programs')
  @ApiOperation({ summary: 'Search every school\'s departments — name, college, school' })
  findAll(@Query() query: QueryProgramsDto) {
    return this.programs.findAll(query);
  }

  @Public()
  @Get('programs/facets')
  @ApiOperation({ summary: 'Filter-panel counts — levels, languages, regions, schools, tuition range' })
  facets() {
    return this.programs.facets();
  }
}
