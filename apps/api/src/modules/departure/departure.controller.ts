import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { DepartureService } from './departure.service.js';
import { CreateChecklistItemDto, UpdateChecklistItemDto, UpdateDeparturePlanDto } from './dto/departure.dto.js';

/** 1F-06/1F-07 — pre-departure plan and checklist. */
@ApiTags('departure')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class DepartureController {
  constructor(private readonly departure: DepartureService) {}

  @Get('cases/:caseId/departure')
  @ApiOperation({ summary: 'The case`s pre-departure plan with its checklist (1F-09)' })
  find(@Param('caseId', ParseUUIDPipe) caseId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.departure.findForCase(caseId, user);
  }

  @Post('cases/:caseId/departure')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Open the plan and clone the seeded checklist (1F-07)' })
  open(@Param('caseId', ParseUUIDPipe) caseId: string) {
    return this.departure.ensurePlan(caseId);
  }

  @Patch('cases/:caseId/departure')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Flight details; setting the date re-dates the checklist — office data, so staff only' })
  update(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: UpdateDeparturePlanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departure.updatePlan(caseId, dto, user);
  }

  @Post('cases/:caseId/departure/items')
  @Roles(...DOC_STAFF_ROLES)
  @ApiOperation({ summary: 'Add a checklist item this client alone needs' })
  addItem(
    @Param('caseId', ParseUUIDPipe) caseId: string,
    @Body() dto: CreateChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departure.addItem(caseId, dto, user);
  }

  @Patch('departure-items/:id')
  @ApiOperation({ summary: 'Tick off (or re-open) one checklist item' })
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departure.updateItem(id, dto, user);
  }
}
