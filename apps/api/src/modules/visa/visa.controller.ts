import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { OpenVisaCaseDto, QueryVisaCasesDto, RecordVisaDecisionDto, TransitionVisaDto, UpdateVisaCaseDto } from './dto/visa.dto.js';
import { VisaService } from './visa.service.js';

/** 1F-01/1F-02/1F-05/1F-10 — the visa phase. */
@ApiTags('visa')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class VisaController {
  constructor(private readonly visa: VisaService) {}

  @Get('visa-cases')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Visa workload across all cases (1F-10)' })
  findAll(@Query() query: QueryVisaCasesDto) {
    return this.visa.findAll(query);
  }

  @Get('cases/:caseId/visa')
  @ApiOperation({ summary: 'The case`s visa record plus its document checklist (1F-08)' })
  find(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.visa.findForCase(caseId, user);
  }

  @Post('cases/:caseId/visa')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Open the visa phase and resolve its document list (1F-02)' })
  open(@Param('caseId', ParseUUIDPipe) caseId: string, @Body() dto: OpenVisaCaseDto) {
    return this.visa.openForCase(caseId, dto);
  }

  @Patch('cases/:caseId/visa')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Visa type, consulate appointment, notes' })
  update(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdateVisaCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visa.update(caseId, dto, user);
  }

  @Post('cases/:caseId/visa/transitions')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Move the visa case through its 8 states (1F-01)' })
  transition(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: TransitionVisaDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visa.transition(caseId, dto, user);
  }

  @Post('cases/:caseId/visa/decision')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Record the visa decision — unlocks the balance or the refund clause (1F-05)' })
  decide(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: RecordVisaDecisionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.visa.recordDecision(caseId, dto, user);
  }
}
