import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CreateWorkTaskDto, QueryWorkTasksDto, UpdateWorkTaskDto } from './dto/work-task.dto.js';
import { WorkTasksService } from './work-tasks.service.js';

/** 1D-10 — translation and other back-office work (gksedu.md §6.4). */
@ApiTags('work-tasks')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...DOC_STAFF_ROLES)
@Controller('work-tasks')
export class WorkTasksController {
  constructor(private readonly tasks: WorkTasksService) {}

  @Get()
  @ApiOperation({ summary: 'List work tasks, filtered by status/assignee/case' })
  findAll(@Query() query: QueryWorkTasksDto) {
    return this.tasks.findAll(query);
  }

  @Get('workload')
  @ApiOperation({ summary: 'Open task counts per assignee (§15.6)' })
  workload() {
    return this.tasks.workload();
  }

  @Post()
  @ApiOperation({ summary: 'Create a work task and assign it' })
  create(@Body() dto: CreateWorkTaskDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasks.create(dto, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update status, assignee or deadline' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkTaskDto) {
    return this.tasks.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a work task' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.remove(id);
  }
}
