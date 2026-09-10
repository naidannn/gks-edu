import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { AssignLeadDto, QueryLeadsDto } from './dto/query-leads.dto.js';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto.js';
import { CreateLeadDto } from './dto/create-lead.dto.js';
import { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';
import { MergeLeadDto } from './dto/merge-lead.dto.js';
import { TransitionLeadDto } from './dto/transition-lead.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { metaRequestContext } from '../meta/request-context.js';
import { LeadsService } from './leads.service.js';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Post('public')
  @Public()
  // The public form is the one endpoint an anonymous visitor can write through,
  // so it gets a tighter limit than the global 120/min.
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Consultation request from the public website' })
  createPublic(@Body() dto: CreatePublicLeadDto, @Req() request: Request) {
    // The visitor's address and user agent are read here rather than in the
    // service: they belong to the HTTP request, and the service is also called
    // from tests and (one day) a queue.
    return this.leads.createFromPublicForm(dto, metaRequestContext(request));
  }

  @Post()
  @Roles(...STAFF_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a walk-in consultation (staff) — 1B-19' })
  create(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.createByStaff(dto, user.id);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List/search leads (staff)' })
  findAll(@Query() query: QueryLeadsDto) {
    return this.leads.findAllStaff(query);
  }

  @Get('stats')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Dashboard counters: funnel breakdown, unassigned, own open leads, recent (1B-08)' })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.stats(user.id);
  }

  @Get('duplicates')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Нэг утсаар давхардсан сэжмийн бүлгүүд (1B-09)' })
  duplicateClusters() {
    return this.leads.duplicateClusters();
  }

  @Get(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'One lead with its 10 most recent activities (staff)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.findOneStaff(id);
  }

  @Patch(':id')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Edit a lead\'s own fields (staff)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Post(':id/transitions')
  @Roles(...STAFF_ROLES)
  @Audit({ action: 'lead.transition', entity: 'Lead' })
  @ApiOperation({ summary: 'Move a lead to another sales-funnel stage (1B-02)' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.transition(id, dto, user.id);
  }

  @Get(':id/activities')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: "A lead's full activity timeline, paginated (1B-03)" })
  listActivities(@Param('id', ParseUUIDPipe) id: string, @Query() query: PaginationQueryDto) {
    return this.leads.listActivities(id, query);
  }

  @Post(':id/activities')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Log a call/meeting/note/message against a lead (1B-03)' })
  addActivity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadActivityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.addActivity(id, dto, user.id);
  }

  @Patch(':id/assign')
  @Roles(...STAFF_ROLES)
  @Audit({ action: 'lead.assign', entity: 'Lead' })
  @ApiOperation({ summary: 'Assign (or unassign) a lead to a staff member (1B-04)' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.assign(id, dto, user.id);
  }

  @Get(':id/duplicates')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Энэ сэжимтэй давхардаж болзошгүй бичлэгүүд (1B-09)' })
  duplicates(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.findDuplicates(id);
  }

  @Post(':id/merge')
  @Roles(...STAFF_ROLES)
  @Audit({ action: 'lead.merge', entity: 'Lead' })
  @ApiOperation({ summary: 'Давхардсан сэжмийг энэ бичлэг рүү нэгтгэх (1B-09)' })
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MergeLeadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.leads.merge(id, dto.sourceId, user.id);
  }

  @Post(':id/assign/auto')
  @Roles(...STAFF_ROLES)
  @Audit({ action: 'lead.assign_auto', entity: 'Lead' })
  @ApiOperation({ summary: 'Round-robin auto-assign to the least-loaded active staff member (1B-04)' })
  autoAssign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.leads.autoAssign(id, user.id);
  }
}
