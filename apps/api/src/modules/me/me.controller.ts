import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { StartMyCaseDto } from './dto/start-case.dto.js';
import { UpsertMyProfileDto } from './dto/upsert-my-profile.dto.js';
import { MeService } from './me.service.js';

/**
 * The client portal's own API. Every route acts on the caller — there is no
 * user id in any path, so one client can never read another's case.
 */
@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get('profile')
  @ApiOperation({ summary: "The caller's own client record and what is still missing from it" })
  profile(@CurrentUser() user: AuthenticatedUser) {
    return this.me.profile(user.id);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Create or update own client record (1B-18)' })
  saveProfile(@Body() dto: UpsertMyProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.me.saveProfile(user.id, dto);
  }

  @Get('services')
  @ApiOperation({ summary: 'Services on offer with the price in effect today (§5.4)' })
  services() {
    return this.me.services();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Portal dashboard: profile, every case, the next step on each (1G-15)' })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.me.overview(user.id);
  }

  @Post('cases')
  @ApiOperation({ summary: 'Open a service cycle and issue its electronic brokerage contract (1C-23)' })
  startCase(@Body() dto: StartMyCaseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.me.startCase(user.id, dto);
  }

  @Get('cases/:id')
  @ApiOperation({ summary: 'One own case with its journey, paperwork progress and next step' })
  caseDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.me.caseDetail(user.id, id);
  }
}
