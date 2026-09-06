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
import { AdminUniversitiesService } from './admin-universities.service.js';
import { GksRankingService } from './ranking/gks-ranking.service.js';
import { PreviewRankingDto, UpdateRankingConfigDto } from './dto/ranking-config.dto.js';
import {
  CreateIntakeTermForUniversityDto,
  UpdateIntakeTermForUniversityDto,
} from '../admissions/dto/intake-term.dto.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import { CreateUniversityDto } from './dto/create-university.dto.js';
import { QueryAdminUniversitiesDto } from './dto/query-admin-universities.dto.js';
import { UpdateUniversityDto } from './dto/update-university.dto.js';
import { AdminProgramsService } from '../programs/admin-programs.service.js';
import {
  CreateUniversityProgramDto,
  UpdateProgramDto,
} from '../programs/dto/university-program.dto.js';

/**
 * Staff catalogue management (1A-25 … 1A-27). Kept apart from the `@Public()`
 * catalogue controller so no route here can ever inherit its openness: reads
 * are staff, and destructive writes are admin-only.
 */
@ApiTags('admin-universities')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/universities')
export class AdminUniversitiesController {
  constructor(
    private readonly universities: AdminUniversitiesService,
    private readonly ranking: GksRankingService,
    private readonly admissions: AdmissionsService,
    private readonly programs: AdminProgramsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List every university, drafts included (1A-25)' })
  findAll(@Query() query: QueryAdminUniversitiesDto) {
    return this.universities.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Catalogue counters for the list header' })
  stats() {
    return this.universities.stats();
  }

  @Get('regions')
  @ApiOperation({ summary: 'Regions across every school, for the filter panel' })
  regions() {
    return this.universities.regions();
  }

  // --- GKS ranking (1A-29 … 1A-31) ---
  //
  // Declared above `:id`: Nest matches routes in declaration order, and
  // `ranking/config` would otherwise be swallowed by the id route.

  @Get('ranking/config')
  @ApiOperation({ summary: 'Weights behind the GKS ranking (1A-29)' })
  rankingConfig() {
    return this.ranking.getConfig();
  }

  @Get('ranking/preview')
  @ApiOperation({ summary: 'Dry-run the ranking with different weights — nothing is written' })
  rankingPreview(@Query() query: PreviewRankingDto) {
    const { limit, ...overrides } = query;
    return this.ranking.preview(overrides, limit);
  }

  @Patch('ranking/config')
  @Roles(Role.ADMIN)
  @Audit({ action: 'university.ranking.config', entity: 'GksRankingConfig', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Retune the weights — recomputes every school (1A-29)' })
  updateRankingConfig(@Body() dto: UpdateRankingConfigDto, @CurrentUser() user: AuthenticatedUser) {
    return this.ranking.updateConfig(dto, user.id);
  }

  @Post('ranking/recompute')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'university.ranking.recompute', entity: 'University' })
  @ApiOperation({ summary: 'Rescore and re-rank every school now (1A-30)' })
  recomputeRanking() {
    return this.ranking.recompute();
  }

  @Get(':id')
  @ApiOperation({ summary: 'One university with programmes, intakes and internal notes' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.universities.findOne(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a university by hand (1A-25)' })
  create(@Body() dto: CreateUniversityDto) {
    return this.universities.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a university (1A-26)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUniversityDto) {
    return this.universities.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a university that nothing references' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.universities.remove(id);
  }

  // --- Programmes ---
  //
  // Kept on this path because the catalogue detail page edits programmes
  // inline (1A-27), but the work belongs to the programmes module: the tuition
  // columns, the study-field matching, the cache invalidation and the delete
  // guard all live there, and a second copy here is how the two drift apart.
  // The same arrangement as the intake routes below.

  @Post(':id/programs')
  @ApiOperation({ summary: 'Add a programme (1A-27)' })
  createProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateUniversityProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.create({ ...dto, universityId: id }, user.id);
  }

  @Patch(':id/programs/:programId')
  @ApiOperation({ summary: 'Edit a programme (1A-27)' })
  updateProgram(
    @Param('programId', ParseUUIDPipe) programId: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.update(programId, dto, user.id);
  }

  @Delete(':id/programs/:programId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a programme no case or application uses' })
  async removeProgram(@Param('programId', ParseUUIDPipe) programId: string): Promise<void> {
    await this.programs.remove(programId);
  }

  // --- Intake terms ---
  //
  // Kept on this path because the catalogue detail page edits rounds inline
  // (1A-27), but the work belongs to the admissions module: the internal
  // deadline, the cache invalidation and the delete guard all live there, and
  // duplicating them would be how the two drift apart.

  @Post(':id/intakes')
  @ApiOperation({ summary: 'Add an intake term (1A-27, 1H-05)' })
  createIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateIntakeTermForUniversityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.create({ ...dto, universityId: id }, user.id);
  }

  @Patch(':id/intakes/:intakeId')
  @ApiOperation({ summary: 'Edit an intake term (1A-27, 1H-05)' })
  updateIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
    @Body() dto: UpdateIntakeTermForUniversityDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admissions.update(intakeId, dto, user.id, id);
  }

  @Delete(':id/intakes/:intakeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an intake term no case or application uses' })
  async removeIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
  ): Promise<void> {
    await this.admissions.remove(intakeId, id);
  }
}
