import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role } from '../../prisma/client.js';
import {
  QueryNotificationsDto,
  QueryTemplatesDto,
  SetPreferenceDto,
  UpdateTemplateDto,
} from './dto/notifications.dto.js';
import { NotificationTemplatesService } from './notification-templates.service.js';
import { NotificationsService } from './notifications.service.js';
import { ReminderSweepsService } from './reminder-sweeps.service.js';
import { SmsBudgetService } from './sms-budget.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly templates: NotificationTemplatesService,
    private readonly sweeps: ReminderSweepsService,
    private readonly smsBudget: SmsBudgetService,
  ) {}

  // ── In-app centre (1G-05) — every logged-in user ─────────────────────────

  @Get()
  @ApiOperation({ summary: 'Миний мэдэгдлүүд (1G-05)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryNotificationsDto) {
    return this.notifications.listForUser(user.id, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Уншаагүй мэдэгдлийн тоо (хонхны тэмдэглэгээ)' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Мэдэгдлийг уншсан болгох' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Бүгдийг уншсан болгох' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Мэдэгдлийн сувгийн тохиргоо' })
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Сувгийг асаах/унтраах (in-app үргэлж асаалттай)' })
  setPreference(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPreferenceDto) {
    return this.notifications.setPreference(user.id, dto.channel, dto.enabled);
  }

  // ── Administration (1G-06) ───────────────────────────────────────────────

  @Get('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Мэдэгдлийн загварууд (1G-06)' })
  listTemplates(@Query() query: QueryTemplatesDto) {
    return this.templates.list(query);
  }

  @Patch('templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Загварын текст засах' })
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Post('templates/seed')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Дутуу загварыг нөхөж үүсгэх (байгаа мөрийг дарж бичихгүй)' })
  seedTemplates() {
    return this.templates.seedDefaults();
  }

  @Get('sms-usage')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Өнөөдрийн SMS зарцуулалт ба хязгаар (1G-04)' })
  smsUsage() {
    return this.smsBudget.usage();
  }

  @Post('sweeps/run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Хуваарьт сануулгыг гараар ажиллуулах (1G-07)' })
  runSweeps() {
    return this.sweeps.sweepAll();
  }
}
