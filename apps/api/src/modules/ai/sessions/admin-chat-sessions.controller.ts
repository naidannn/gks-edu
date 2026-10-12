import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { STAFF_ROLES } from '../../../common/constants/roles.js';
import { Roles } from '../../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { AdminChatSessionsService } from './admin-chat-sessions.service.js';
import { QueryAiPeopleDto, QueryAiSessionsDto } from './dto/admin-chat-sessions.dto.js';

/**
 * The assistant's conversations, for the office (2E-04).
 *
 * CRM staff only: a conversation with the assistant is a sales conversation —
 * names, phone numbers, budgets — and it sits with leads, not with paperwork,
 * so the document officer does not get it.
 */
@ApiTags('admin-ai-sessions')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...STAFF_ROLES)
@Controller('admin/ai')
export class AdminChatSessionsController {
  constructor(private readonly sessions: AdminChatSessionsService) {}

  @Get('sessions')
  @ApiOperation({ summary: 'AI чатын жагсаалт — табын тоонуудтай' })
  list(@Query() query: QueryAiSessionsDto) {
    return this.sessions.list(query);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Нэг чатын бүтэн транскрипт, tool дуудлага, өртөг' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.detail(id);
  }

  @Get('people')
  @ApiOperation({ summary: 'AI-тай чатласан хүмүүс — хэрэглэгч эсвэл зочноор бүлэглэсэн' })
  people(@Query() query: QueryAiPeopleDto) {
    return this.sessions.people(query);
  }
}
