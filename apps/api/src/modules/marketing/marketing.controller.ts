import {
  BadRequestException,
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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { Role } from '../../prisma/client.js';
import { CampaignsService } from './campaigns.service.js';
import { MarketingAudienceService } from './marketing-audience.service.js';
import { MARKETING_PLACEHOLDERS } from './marketing-email.js';
import { MarketingTemplatesService } from './marketing-templates.service.js';
import { SubscribersService } from './subscribers.service.js';
import {
  AudiencePreviewDto,
  CreateCampaignDto,
  CreateMarketingTemplateDto,
  QueryCampaignsDto,
  QueryRecipientsDto,
  QuerySubscribersDto,
  SendTestDto,
  SubscribeDto,
  UnsubscribeDto,
  UpdateCampaignDto,
  UpdateMarketingTemplateDto,
  UpdateSubscriberDto,
} from './dto/marketing.dto.js';

/**
 * 1O — mass mail over Brevo.
 *
 * Everything except the two public endpoints is `ADMIN`. Sending to the whole
 * client base is not a consultant's action: it is irreversible, it is the
 * company speaking, and the blast radius of a mistake is every address the
 * business holds.
 */
@ApiTags('marketing')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('marketing')
export class MarketingController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly templates: MarketingTemplatesService,
    private readonly audience: MarketingAudienceService,
    private readonly subscribers: SubscribersService,
  ) {}

  // ── Public ───────────────────────────────────────────────────────────────

  @Post('subscribe')
  @Public()
  // A newsletter box on a public page is a spam magnet; five a minute from one
  // address is far more than a person needs and far less than a script wants.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Мэдээллийн захиалга (нийтийн)' })
  subscribe(@Body() dto: SubscribeDto) {
    return this.subscribers.subscribe({
      email: dto.email,
      name: dto.name,
      source: 'website_footer',
      tags: dto.tags,
      utm: dto.utm,
    });
  }

  @Post('unsubscribe')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Захиалгаас гарах (нийтийн, гарын үсэгтэй холбоос)' })
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    const email = await this.subscribers.unsubscribeByToken(dto.token);
    if (!email) throw new BadRequestException('Холбоос хүчингүй байна');
    return { email };
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Имэйлийн загварууд' })
  listTemplates() {
    return this.templates.list();
  }

  @Get('placeholders')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Загварт ашиглах орлуулгын жагсаалт' })
  placeholders() {
    return MARKETING_PLACEHOLDERS;
  }

  @Post('templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Имэйлийн загвар үүсгэх' })
  createTemplate(@Body() dto: CreateMarketingTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.templates.create(dto, user.id);
  }

  @Patch('templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Имэйлийн загвар засах' })
  updateTemplate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMarketingTemplateDto) {
    return this.templates.update(id, dto);
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Имэйлийн загвар устгах' })
  async removeTemplate(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.templates.remove(id);
  }

  @Post('templates/seed')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Үндсэн загваруудын дутууг нөхөх' })
  seedTemplates() {
    return this.templates.seedDefaults();
  }

  // ── Audience ─────────────────────────────────────────────────────────────

  @Post('audience/preview')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Сонгосон сегментийн хүлээн авагчийн тоо' })
  previewAudience(@Body() dto: AudiencePreviewDto) {
    return this.audience.preview(dto.audience, dto.filters ?? {});
  }

  // ── Campaigns ────────────────────────────────────────────────────────────

  @Get('campaigns')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Кампанит ажлын жагсаалт' })
  listCampaigns(@Query() query: QueryCampaignsDto) {
    return this.campaigns.list({ ...query, skip: query.skip });
  }

  @Post('campaigns')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Кампанит ажил үүсгэх (ноорог)' })
  createCampaign(@Body() dto: CreateCampaignDto, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.create(dto, user.id);
  }

  @Get('campaigns/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Кампанит ажлын дэлгэрэнгүй' })
  findCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.findOne(id);
  }

  @Patch('campaigns/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ноорог кампанит ажил засах' })
  updateCampaign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete('campaigns/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ноорог кампанит ажил устгах' })
  async removeCampaign(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.campaigns.remove(id);
  }

  @Get('campaigns/:id/preview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Имэйлийн урьдчилсан харагдац (HTML)' })
  previewCampaign(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.preview(id);
  }

  @Post('campaigns/:id/test')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Нэг хаяг руу тест илгээх' })
  async testCampaign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendTestDto) {
    await this.campaigns.sendTest(id, dto.email, dto.name);
    return { sent: true };
  }

  @Post('campaigns/:id/send')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Кампанит ажлыг илгээх дараалалд оруулах' })
  sendCampaign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.queueSend(id, user.id);
  }

  @Post('campaigns/:id/cancel')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Илгээхийг зогсоох (илгээгдээгүйг нь)' })
  cancelCampaign(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.campaigns.cancel(id, user.id);
  }

  @Get('campaigns/:id/recipients')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Хүлээн авагчид ба тэдний төлөв' })
  campaignRecipients(@Param('id', ParseUUIDPipe) id: string, @Query() query: QueryRecipientsDto) {
    return this.campaigns.recipients(id, { ...query, skip: query.skip });
  }

  // ── Subscribers ──────────────────────────────────────────────────────────

  @Get('subscribers')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Захиалагчийн жагсаалт' })
  listSubscribers(@Query() query: QuerySubscribersDto) {
    return this.subscribers.list({ ...query, skip: query.skip });
  }

  @Get('subscribers/stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Захиалагчийн тоо, төлөвөөр' })
  subscriberStats() {
    return this.subscribers.stats();
  }

  @Patch('subscribers/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Захиалагчийн төлөв өөрчлөх' })
  updateSubscriber(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSubscriberDto) {
    return this.subscribers.setStatus(id, dto.status);
  }

  @Post('subscribers/sync')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Захиалагчдыг Brevo-гийн жагсаалт руу илгээх' })
  syncSubscribers() {
    return this.subscribers.syncToBrevo();
  }
}
