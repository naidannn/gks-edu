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
import { AdminProgramsService } from './admin-programs.service.js';
import { BulkCreateProgramsDto } from './dto/bulk-programs.dto.js';
import { QueryAdminProgramsDto } from './dto/query-programs.dto.js';
import { StartProgramResearchDto } from './dto/start-program-research.dto.js';
import { CreateProgramDto, UpdateProgramDto } from './dto/university-program.dto.js';
import { ProgramResearchService } from './research/program-research.service.js';

/**
 * Staff programme and tuition management. Split from the `@Public()` catalogue
 * controller so no route here can inherit its openness.
 */
@ApiTags('admin-programs')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/programs')
export class AdminProgramsController {
  constructor(
    private readonly programs: AdminProgramsService,
    private readonly research: ProgramResearchService,
  ) {}

  // Every literal path below is declared before `:id`: Nest matches in
  // declaration order, and `research` would otherwise be read as an id.

  @Get()
  @ApiOperation({ summary: 'Every programme across every school, drafts included' })
  findAll(@Query() query: QueryAdminProgramsDto) {
    return this.programs.findAllAdmin(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'How much of the catalogue is priced, classified and checked' })
  stats() {
    return this.programs.stats();
  }

  // --- Gemini research. Proposes; never writes. ---

  @Get('research')
  @ApiOperation({ summary: 'Recent research runs, so a search can be reopened rather than repaid for' })
  recentRuns(@Query('universityId') universityId?: string) {
    return this.research.findRecent(universityId);
  }

  @Post('research')
  @Audit({ action: 'program.research.start', entity: 'ProgramResearchRun', idFrom: 'response.id' })
  @ApiOperation({ summary: "Queue a lookup of this school's programmes and tuition" })
  startResearch(@Body() dto: StartProgramResearchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.research.start(dto, user.id);
  }

  @Get('research/:runId')
  @ApiOperation({ summary: 'One run — poll this while it works' })
  findRun(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.research.findOne(runId);
  }

  // --- Writes ---

  @Post('bulk')
  @Audit({ action: 'program.bulk-create', entity: 'UniversityProgram' })
  @ApiOperation({ summary: 'Save the candidates a human ticked off a research run' })
  bulkCreate(@Body() dto: BulkCreateProgramsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.programs.bulkCreate(dto, user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One programme, with its internal notes' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.findOne(id);
  }

  @Post()
  @Audit({ action: 'program.create', entity: 'UniversityProgram', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Add a programme by hand' })
  create(@Body() dto: CreateProgramDto, @CurrentUser() user: AuthenticatedUser) {
    return this.programs.create(dto, user.id);
  }

  @Patch(':id')
  @Audit({ action: 'program.update', entity: 'UniversityProgram', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Edit a programme' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.programs.update(id, dto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'program.delete', entity: 'UniversityProgram', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Delete a programme no case or application uses' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.programs.remove(id);
  }
}
