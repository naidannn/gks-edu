import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ReopenEssayDto, SaveProfileQuestionnaireDto } from './dto/questionnaire.dto.js';
import { ProfileQuestionnaireService } from './profile-questionnaire.service.js';

/**
 * The client's own profile questionnaire (1B-29). Like the rest of `/me`, the
 * path carries no id — the caller's client record is the only one reachable.
 */
@ApiTags('questionnaires')
@ApiBearerAuth()
@Controller('me/profile-questionnaire')
export class MyProfileQuestionnaireController {
  constructor(private readonly questionnaire: ProfileQuestionnaireService) {}

  @Get()
  @ApiOperation({ summary: 'The profile questionnaire, its questions and answers so far' })
  async get(@CurrentUser() user: AuthenticatedUser) {
    return this.questionnaire.get(await this.questionnaire.clientIdForUser(user.id));
  }

  @Patch()
  @ApiOperation({ summary: 'Autosave — merge the changed answers' })
  async save(@Body() dto: SaveProfileQuestionnaireDto, @CurrentUser() user: AuthenticatedUser) {
    return this.questionnaire.save(await this.questionnaire.clientIdForUser(user.id), dto, 'client');
  }

  @Post('submit')
  @ApiOperation({ summary: 'Hand the answers to the office' })
  async submit(@CurrentUser() user: AuthenticatedUser) {
    return this.questionnaire.submit(await this.questionnaire.clientIdForUser(user.id));
  }
}

/** The same questionnaire from the client's card — read, filled in on their behalf, sent back. */
@ApiTags('questionnaires')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...DOC_STAFF_ROLES)
@Controller('clients/:clientId/profile-questionnaire')
export class ClientProfileQuestionnaireController {
  constructor(private readonly questionnaire: ProfileQuestionnaireService) {}

  @Get()
  @ApiOperation({ summary: "A client's profile questionnaire (staff)" })
  get(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.questionnaire.get(clientId);
  }

  @Patch()
  @ApiOperation({ summary: 'Fill in or correct answers on the client’s behalf (staff)' })
  save(@Param('clientId', ParseUUIDPipe) clientId: string, @Body() dto: SaveProfileQuestionnaireDto) {
    return this.questionnaire.save(clientId, dto, 'staff');
  }

  @Post('reopen')
  @ApiOperation({ summary: 'Send the questionnaire back to the client with a note (staff)' })
  reopen(@Param('clientId', ParseUUIDPipe) clientId: string, @Body() dto: ReopenEssayDto) {
    return this.questionnaire.reopen(clientId, dto);
  }

  @Get('text')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @ApiOperation({ summary: 'Every question and answer as plain text (staff)' })
  text(@Param('clientId', ParseUUIDPipe) clientId: string) {
    return this.questionnaire.asText(clientId);
  }
}
