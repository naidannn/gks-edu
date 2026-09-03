import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueryUniversitiesDto } from './dto/query-universities.dto.js';
import { UniversitiesService } from './universities.service.js';

/** Public catalogue — every route here is readable without a token (1A-04, 1A-05). */
@ApiTags('universities')
@Public()
@Controller('universities')
export class UniversitiesController {
  constructor(private readonly universities: UniversitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter published universities' })
  findAll(@Query() query: QueryUniversitiesDto) {
    return this.universities.findAll(query);
  }

  @Get('facets')
  @ApiOperation({ summary: 'Filter-panel facets (regions, types, counts)' })
  facets() {
    return this.universities.facets();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'One university with its programmes and intake terms' })
  findOne(@Param('slug') slug: string) {
    return this.universities.findBySlug(slug);
  }
}
