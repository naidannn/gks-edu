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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CreateFacultyDto, UpdateFacultyDto } from './dto/faculty.dto.js';
import { FacultiesService } from './faculties.service.js';

/**
 * Танхим — staff only. There is no public faculty endpoint: a visitor meets a
 * faculty as a line on a programme card, never as a thing to browse.
 */
@ApiTags('admin-faculties')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/faculties')
export class AdminFacultiesController {
  constructor(private readonly faculties: FacultiesService) {}

  @Get()
  @ApiOperation({ summary: "One school's colleges, with how many programmes sit in each" })
  findAll(@Query('universityId', ParseUUIDPipe) universityId: string) {
    return this.faculties.findByUniversity(universityId);
  }

  @Post()
  @Audit({ action: 'faculty.create', entity: 'Faculty', idFrom: 'response.id' })
  @ApiOperation({ summary: 'Add a college' })
  create(@Body() dto: CreateFacultyDto) {
    return this.faculties.create(dto);
  }

  @Patch(':id')
  @Audit({ action: 'faculty.update', entity: 'Faculty', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Rename a college' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFacultyDto) {
    return this.faculties.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({ action: 'faculty.delete', entity: 'Faculty', idFrom: 'params.id' })
  @ApiOperation({ summary: 'Delete a college — its programmes stay, without one' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.faculties.remove(id);
  }
}
