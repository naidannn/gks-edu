import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { CasesService } from './cases.service.js';
import { AssignCaseDto } from './dto/assign-case.dto.js';
import { CreateCaseDto } from './dto/create-case.dto.js';
import { QueryCasesDto } from './dto/query-cases.dto.js';
import { ReplaceUniversityChoicesDto } from './dto/replace-university-choices.dto.js';
import { TransitionCaseDto } from './dto/transition-case.dto.js';

@ApiTags('cases')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Open a new case for a user × service × university (1C-02)' })
  create(@Body() dto: CreateCaseDto) {
    return this.cases.create(dto);
  }

  @Get()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'List/search cases (staff)' })
  findAll(@Query() query: QueryCasesDto) {
    return this.cases.findAllStaff(query);
  }

  @Get('mine')
  @ApiOperation({ summary: 'The logged-in user`s own cases (1C-17)' })
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.cases.findMine(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One case with contract/payments/transition history (staff, or the owning user)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.cases.findOne(id, user);
  }

  @Post(':id/transitions')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Move a case to another stage, per the service`s allowed flow (1C-03)' })
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionCaseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.cases.transition(id, dto, user);
  }

  @Patch(':id/universities')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Replace the schools chosen on a case, in preference order (§5.1)' })
  replaceUniversities(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplaceUniversityChoicesDto) {
    return this.cases.replaceUniversityChoices(id, dto);
  }

  @Patch(':id/assign')
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Assign (or unassign) the consultant/doc-officer handling a case' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCaseDto) {
    return this.cases.assign(id, dto);
  }
}
