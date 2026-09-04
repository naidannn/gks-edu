import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { SaveUniversityDto } from './dto/save-university.dto.js';
import { SavedUniversitiesService } from './saved-universities.service.js';

/** A logged-in visitor's university shortlist (1A-18). Every route needs a token. */
@ApiTags('saved-universities')
@ApiBearerAuth()
@Controller('me/saved-universities')
export class SavedUniversitiesController {
  constructor(private readonly saved: SavedUniversitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Universities the current user has saved' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.saved.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Save a university to the shortlist' })
  save(@Body() dto: SaveUniversityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.saved.save(user.id, dto.universityId);
  }

  @Delete(':universityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a university from the shortlist' })
  async unsave(
    @Param('universityId', ParseUUIDPipe) universityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.saved.unsave(user.id, universityId);
  }
}
