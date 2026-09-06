import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { ConversationStatus } from '../../prisma/client.js';
import { AssignConversationDto, QueryInboxDto } from './dto/messenger.dto.js';
import { MessengerService } from './messenger.service.js';

/**
 * The shared inbox (1K).
 *
 * Open to every staff role including `DOC_OFFICER`: half of what a client
 * writes in is a question about their materials, and the person who reviews
 * those is the one who can answer it.
 */
@ApiTags('messenger')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...DOC_STAFF_ROLES)
@Controller('admin/conversations')
export class AdminConversationsController {
  constructor(private readonly messenger: MessengerService) {}

  @Get()
  @ApiOperation({ summary: 'Чатын нэгдсэн inbox' })
  inbox(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryInboxDto) {
    return this.messenger.inbox(user, query);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Inbox-ийн шүүлтүүрийн тоонууд' })
  counts(@CurrentUser() user: AuthenticatedUser) {
    return this.messenger.inboxCounts(user);
  }

  @Get('staff')
  @ApiOperation({ summary: 'Чат хариуцаж болох ажилтнууд' })
  staff() {
    return this.messenger.assignableStaff();
  }

  @Patch(':id/assign')
  @ApiOperation({ summary: 'Хариуцагч тогтоох (хоосон бол салгана)' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignConversationDto,
  ) {
    return this.messenger.assign(user, id, dto);
  }

  @Patch(':id/resolve')
  @ApiOperation({ summary: 'Шийдвэрлэсэн болгох — хэрэглэгч бичвэл дахин нээгдэнэ' })
  resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messenger.setStatus(user, id, ConversationStatus.RESOLVED);
  }

  @Patch(':id/reopen')
  @ApiOperation({ summary: 'Дахин нээх' })
  reopen(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.messenger.setStatus(user, id, ConversationStatus.OPEN);
  }
}
