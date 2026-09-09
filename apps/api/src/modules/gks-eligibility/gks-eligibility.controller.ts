import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { QueryGksEligibilityDto } from './dto/query-gks-eligibility.dto.js';
import { GksEligibilityService } from './gks-eligibility.service.js';

/**
 * GKS боломжийн шалгуур (1L-01, ARCHITECTURE.md §3.5).
 *
 * One public endpoint, and a `GET` for the same reason `/study-plan` is one:
 * the answer is then a link. That matters more here than there — this page is
 * where a Facebook ad lands, and the visitor's own copy of what they said is
 * the URL in their address bar. Nothing is stored until they ask us to call.
 */
@ApiTags('gks-eligibility')
@Public()
@Controller('gks-eligibility')
export class GksEligibilityController {
  constructor(private readonly eligibility: GksEligibilityService) {}

  @Get()
  @ApiOperation({ summary: 'May this person apply for GKS, how strong is their file, and what if it fails' })
  check(@Query() query: QueryGksEligibilityDto) {
    return this.eligibility.check(query);
  }
}
