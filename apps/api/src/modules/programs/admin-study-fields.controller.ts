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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Role } from '../../prisma/client.js';
import {
  AssignStudyFieldDto,
  CreateStudyFieldDto,
  RematchStudyFieldsDto,
  UpdateStudyFieldDto,
} from './dto/study-field.dto.js';
import { StudyFieldsService } from './study-fields.service.js';

/**
 * The taxonomy staff maintain, and the two operations that keep it useful:
 * `assign` files a batch of programmes under one subject and can learn their
 * wording, `rematch` re-runs the matcher over the catalogue afterwards. Those
 * two together are the whole "нэршлийг нэгтгэх" loop.
 */
@ApiTags('admin-study-fields')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/study-fields')
export class AdminStudyFieldsController {
  constructor(private readonly studyFields: StudyFieldsService) {}

  @Get()
  @ApiOperation({ summary: 'The whole taxonomy with programme counts, inactive rows included' })
  findAll() {
    return this.studyFields.findAll();
  }

  @Post('rematch')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @Audit({ action: 'study-field.rematch', entity: 'UniversityProgram' })
  @ApiOperation({ summary: 'Re-run the matcher over the catalogue. Defaults to a dry run.' })
  rematch(@Body() dto: RematchStudyFieldsDto) {
    return this.studyFields.rematch(dto);
  }

  @Post()
  @Audit({ action: 'study-field.create', entity: 'StudyField', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Add a subject or a group' })
  create(@Body() dto: CreateStudyFieldDto) {
    return this.studyFields.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'study-field.update', entity: 'StudyField', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Edit a subject — including its aliases, which is how the matcher learns' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudyFieldDto) {
    return this.studyFields.update(id, dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @Audit({ action: 'study-field.assign', entity: 'StudyField', idFrom: 'params.id' })
  @ApiOperation({ summary: 'File a batch of programmes under this subject, optionally learning their names' })
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignStudyFieldDto) {
    return this.studyFields.assign(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(Role.ADMIN)
  @Audit({ action: 'study-field.delete', entity: 'StudyField', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Delete a subject — its programmes fall back to "ангилаагүй", they are not deleted' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.studyFields.remove(id);
  }
}
