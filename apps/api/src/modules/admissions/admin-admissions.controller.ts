import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role } from '../../prisma/client.js';
import { AdmissionConfigService } from './admission-config.service.js';
import { AdmissionsBoardService } from './admissions-board.service.js';
import { AdmissionsService } from './admissions.service.js';
import { UpdateAdmissionConfigDto } from './dto/admission-config.dto.js';
import {
  BulkCreateIntakeTermsDto,
  CreateIntakeTermDto,
  UpdateIntakeTermDto,
  UpsertIntakeProgramOverrideDto,
} from './dto/intake-term.dto.js';
import { QueryAdminAdmissionsDto } from './dto/query-admissions.dto.js';
import { StartIntakeResearchDto } from './dto/start-research.dto.js';
import { IntakeResearchService } from './research/intake-research.service.js';

/**
 * Staff admissions management (1H-05, 1H-08, 1H-10). Split from the `@Public()`
 * calendar controller so no route here can inherit its openness.
 */
@ApiTags('admin-admissions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/admissions')
export class AdminAdmissionsController {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly board: AdmissionsBoardService,
    private readonly config: AdmissionConfigService,
    private readonly research: IntakeResearchService,
  ) {}

  // Every literal path below is declared before `:id`: Nest matches in
  // declaration order, and `config` would otherwise be read as an id.

  @Get()
  @ApiOperation({ summary: 'Every intake round, drafts included (1H-05)' })
  findAll(@Query() query: QueryAdminAdmissionsDto) {
    return this.admissions.findAllAdmin(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Counters for the admissions header (open, closing, undated, at risk)' })
  stats() {
    return this.board.stats();
  }

  @Get('board')
  @ApiOperation({ summary: 'Cases grouped under the intake they are racing (1H-08)' })
  boardView(
    @Query('universityId') universityId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('onlyAtRisk') onlyAtRisk?: string,
  ) {
    return this.board.board({ universityId, assigneeId, onlyAtRisk: onlyAtRisk === 'true' });
  }

  @Get('at-risk')
  @ApiOperation({ summary: 'Cases short on documents with their deadline in sight' })
  atRisk(@Query('assigneeId') assigneeId?: string) {
    return this.board.atRisk(assigneeId);
  }

  // --- Configuration (1H-02) ---

  @Get('config')
  @ApiOperation({ summary: 'Admissions configuration — lead time, reminder ladder, risk threshold' })
  getConfig() {
    return this.config.getForAdmin();
  }

  @Patch('config')
  @Roles(Role.ADMIN)
  @Audit({ action: 'admission.config.update', entity: 'AdmissionConfig' })
  @ApiOperation({
    summary: 'Retune the configuration — a new lead time recomputes every automatic internal deadline',
  })
  async updateConfig(@Body() dto: UpdateAdmissionConfigDto, @CurrentUser() user: AuthenticatedUser) {
    const config = await this.config.update(dto, user.id);
    if (dto.internalLeadDays !== undefined) await this.admissions.recomputeInternalDeadlines();
    return config;
  }

  // --- Gemini research (1H-10) ---

  @Get('research')
  @ApiOperation({ summary: 'Recent research runs, newest first' })
  researchRuns(@Query('universityId') universityId?: string) {
    return this.research.findRecent(universityId);
  }

  @Post('research')
  @HttpCode(HttpStatus.ACCEPTED)
  @Audit({ action: 'admission.research.start', entity: 'IntakeResearchRun', idFrom: 'response.id' })
  @ApiOperation({
    summary: 'Queue an online lookup of a school\'s intake calendar',
    description:
      'Returns immediately with a run to poll. The result is a PROPOSAL: it fills the form, ' +
      'and a human reviews and saves. Nothing here ever writes an intake by itself.',
  })
  startResearch(@Body() dto: StartIntakeResearchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.research.start(dto, user.id);
  }

  @Get('research/:runId')
  @ApiOperation({ summary: 'One research run — poll this until it leaves QUEUED/RUNNING' })
  researchRun(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.research.findOne(runId);
  }

  // --- Intake CRUD ---

  @Post()
  @Audit({ action: 'admission.intake.create', entity: 'IntakeTerm', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Add an intake round (1H-05)' })
  create(@Body() dto: CreateIntakeTermDto, @CurrentUser() user: AuthenticatedUser) {
    return this.admissions.create(dto, user.id);
  }

  @Post('bulk')
  @Audit({ action: 'admission.intake.bulk-create', entity: 'IntakeTerm' })
  @ApiOperation({ summary: 'Save several reviewed rounds at once — how research candidates land' })
  createMany(@Body() dto: BulkCreateIntakeTermsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.admissions.createMany(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One intake round with its programme overrides' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.admissions.findOneAdmin(id);
  }

  @Patch(':id')
  @Audit({ action: 'admission.intake.update', entity: 'IntakeTerm' })
  @ApiOperation({ summary: 'Edit an intake round — moving the deadline moves its cases' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIntakeTermDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'admission.intake.delete', entity: 'IntakeTerm' })
  @ApiOperation({ summary: 'Delete a round no case or application uses' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.admissions.remove(id);
  }

  // --- Programme overrides ---

  @Post(':id/overrides')
  @ApiOperation({ summary: 'Give one programme its own calendar inside this round' })
  upsertOverride(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpsertIntakeProgramOverrideDto) {
    return this.admissions.upsertOverride(id, dto);
  }

  @Delete(':id/overrides/:overrideId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Drop a programme override — it falls back to the round' })
  async removeOverride(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('overrideId', ParseUUIDPipe) overrideId: string,
  ): Promise<void> {
    await this.admissions.removeOverride(id, overrideId);
  }
}
