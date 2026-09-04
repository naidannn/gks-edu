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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import { AdminUniversitiesService } from './admin-universities.service.js';
import { CreateIntakeTermDto, UpdateIntakeTermDto } from './dto/intake-term.dto.js';
import { CreateUniversityDto } from './dto/create-university.dto.js';
import { QueryAdminUniversitiesDto } from './dto/query-admin-universities.dto.js';
import { UpdateUniversityDto } from './dto/update-university.dto.js';
import {
  CreateUniversityProgramDto,
  UpdateUniversityProgramDto,
} from './dto/university-program.dto.js';

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
  constructor(private readonly universities: AdminUniversitiesService) {}

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

  @Post(':id/programs')
  @ApiOperation({ summary: 'Add a programme (1A-27)' })
  createProgram(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateUniversityProgramDto) {
    return this.universities.createProgram(id, dto);
  }

  @Patch(':id/programs/:programId')
  @ApiOperation({ summary: 'Edit a programme (1A-27)' })
  updateProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('programId', ParseUUIDPipe) programId: string,
    @Body() dto: UpdateUniversityProgramDto,
  ) {
    return this.universities.updateProgram(id, programId, dto);
  }

  @Delete(':id/programs/:programId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a programme no case or application uses' })
  async removeProgram(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('programId', ParseUUIDPipe) programId: string,
  ): Promise<void> {
    await this.universities.removeProgram(id, programId);
  }

  // --- Intake terms ---

  @Post(':id/intakes')
  @ApiOperation({ summary: 'Add an intake term (1A-27)' })
  createIntake(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateIntakeTermDto) {
    return this.universities.createIntake(id, dto);
  }

  @Patch(':id/intakes/:intakeId')
  @ApiOperation({ summary: 'Edit an intake term (1A-27)' })
  updateIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
    @Body() dto: UpdateIntakeTermDto,
  ) {
    return this.universities.updateIntake(id, intakeId, dto);
  }

  @Delete(':id/intakes/:intakeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an intake term no case or application uses' })
  async removeIntake(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('intakeId', ParseUUIDPipe) intakeId: string,
  ): Promise<void> {
    await this.universities.removeIntake(id, intakeId);
  }
}
