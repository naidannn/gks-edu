import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { QueryMyConversationsDto, StartConversationDto } from './dto/messenger.dto.js';
import { MessengerService } from './messenger.service.js';

/** The client's own side of the messenger (1K) — their threads, and starting one. */
@ApiTags('messenger')
@ApiBearerAuth()
@Controller('me/conversations')
export class MeConversationsController {
  constructor(private readonly messenger: MessengerService) {}

  @Get()
  @ApiOperation({ summary: 'Миний чатууд' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryMyConversationsDto) {
    return this.messenger.listMine(user.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Шинэ чат эхлүүлэх — эхний мессежтэйгээ хамт' })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartConversationDto) {
    return this.messenger.start(user, dto);
  }
}
