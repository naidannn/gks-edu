import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MARKETING_QUEUE } from '../../queue/queue.constants.js';
import { BrevoService } from './brevo.service.js';
import { CampaignsProcessor } from './campaigns.processor.js';
import { CampaignsService } from './campaigns.service.js';
import { MarketingAudienceService } from './marketing-audience.service.js';
import { MarketingController } from './marketing.controller.js';
import { MarketingTemplatesService } from './marketing-templates.service.js';
import { SubscribersService } from './subscribers.service.js';

/**
 * 1O — marketing mail. Separate from `NotificationsModule` on purpose: that one
 * is the transactional rail (Resend, one recipient, something they are waiting
 * for), this one is the campaign rail (Brevo, a list, something we chose to
 * send). They share the HTML layout and nothing else.
 */
@Module({
  imports: [BullModule.registerQueue({ name: MARKETING_QUEUE })],
  controllers: [MarketingController],
  providers: [
    BrevoService,
    MarketingAudienceService,
    MarketingTemplatesService,
    SubscribersService,
    CampaignsService,
    CampaignsProcessor,
  ],
  exports: [BrevoService, SubscribersService],
})
export class MarketingModule {}
