import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { Audit } from '../../common/decorators/audit.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  CreateLeadFromThreadDto,
  LinkFacebookThreadDto,
  QueryFacebookCommentsDto,
  QueryFacebookThreadsDto,
  QueryLinkCandidatesDto,
  ReplyFacebookCommentDto,
  SendFacebookMessageDto,
  SetFacebookAiDto,
} from './dto/facebook.dto.js';
import { FacebookAdminService } from './facebook-admin.service.js';

/**
 * The Facebook Page inbox (2F). Every staff role, like the 1K inbox: whoever
 * can answer the question should be able to. The channel's settings are not
 * here — they are part of the assistant's config, `PATCH /admin/ai/config`,
 * which is admin-only and audited.
 */
@ApiTags('admin-facebook')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(...DOC_STAFF_ROLES)
@Controller('admin/facebook')
export class AdminFacebookController {
  constructor(private readonly facebook: FacebookAdminService) {}

  @Get('status')
  @ApiOperation({ summary: 'Page холбогдсон эсэх, AI-ийн Facebook тохиргоо' })
  status() {
    return this.facebook.status();
  }

  @Get('threads')
  @ApiOperation({ summary: 'Messenger чатын жагсаалт' })
  threads(@Query() query: QueryFacebookThreadsDto) {
    return this.facebook.list(query);
  }

  @Get('threads/:id')
  @ApiOperation({ summary: 'Нэг чат, мессежүүдтэй нь — уншсанд тооцно' })
  thread(@Param('id', ParseUUIDPipe) id: string) {
    return this.facebook.detail(id);
  }

  @Post('threads/:id/messages')
  @Audit({ action: 'facebook.message.send', entity: 'FacebookThread' })
  @ApiOperation({ summary: 'Page-ийн нэрээр хариу бичих — AI түр зогсоно' })
  send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendFacebookMessageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facebook.send(id, dto.text, user.id);
  }

  @Patch('threads/:id/ai')
  @ApiOperation({ summary: 'Энэ чатад AI-г асаах/унтраах, түр зогсолтыг цуцлах' })
  setAi(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetFacebookAiDto) {
    return this.facebook.setAi(id, dto);
  }

  @Patch('threads/:id/link')
  @Audit({ action: 'facebook.thread.link', entity: 'FacebookThread' })
  @ApiOperation({ summary: 'Чатыг сэжим/үйлчлүүлэгчтэй холбох' })
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkFacebookThreadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facebook.link(id, dto, user.id);
  }

  @Post('threads/:id/lead')
  @Audit({ action: 'facebook.thread.lead', entity: 'FacebookThread' })
  @ApiOperation({ summary: 'Чатаас сэжим үүсгэж холбох' })
  createLead(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateLeadFromThreadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facebook.createLead(id, dto, user.id);
  }

  @Get('link-candidates')
  @ApiOperation({ summary: 'Холбох сэжим, үйлчлүүлэгч хайх' })
  candidates(@Query() query: QueryLinkCandidatesDto) {
    return this.facebook.candidates(query.search);
  }

  @Post('messages/:id/knowledge')
  @ApiOperation({ summary: 'Ажилтны хариултаас мэдлэгийн сангийн ноорог карт үүсгэх' })
  toKnowledge(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.facebook.toKnowledge(id, user.id);
  }

  @Get('comments')
  @ApiOperation({ summary: 'Постны сэтгэгдлүүд' })
  comments(@Query() query: QueryFacebookCommentsDto) {
    return this.facebook.comments(query);
  }

  @Post('comments/:id/reply')
  @Audit({ action: 'facebook.comment.reply', entity: 'FacebookComment' })
  @ApiOperation({ summary: 'Сэтгэгдэлд нийтэд эсвэл хувиар хариулах' })
  replyToComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyFacebookCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.facebook.replyToComment(id, dto, user.id);
  }

  @Patch('comments/:id/ignore')
  @ApiOperation({ summary: 'Сэтгэгдлийг хариулахгүйгээр хаах' })
  ignoreComment(@Param('id', ParseUUIDPipe) id: string) {
    return this.facebook.ignoreComment(id);
  }
}
