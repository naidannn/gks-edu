import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { FACEBOOK_ASSISTANT_QUEUE, FACEBOOK_INBOUND_QUEUE } from '../../queue/queue.constants.js';
import { AiModule } from '../ai/ai.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { AdminFacebookController } from './admin-facebook.controller.js';
import { FacebookAdminService } from './facebook-admin.service.js';
import { FacebookAssistantService } from './facebook-assistant.service.js';
import { FacebookGraphService } from './facebook-graph.service.js';
import { FacebookIntakeService } from './facebook-intake.service.js';
import { FacebookWebhookController } from './facebook-webhook.controller.js';
import { FacebookAssistantProcessor, FacebookInboundProcessor } from './facebook.processors.js';

/**
 * The office's Facebook Page (2F, AI-ASSISTANT.md §16): Messenger and post
 * comments, answered by the assistant and by staff from `/admin/facebook`.
 *
 * It sits beside the assistant rather than inside it. `AiModule` owns what may
 * be said — retrieval, tools, guard, budget — and this module owns a channel:
 * Meta's webhook, Meta's window, Meta's ids. The website widget is the other
 * channel, and neither knows about the other.
 */
@Module({
  imports: [
    BullModule.registerQueue({ name: FACEBOOK_INBOUND_QUEUE }, { name: FACEBOOK_ASSISTANT_QUEUE }),
    AiModule,
    LeadsModule,
  ],
  controllers: [FacebookWebhookController, AdminFacebookController],
  providers: [
    FacebookGraphService,
    FacebookIntakeService,
    FacebookAssistantService,
    FacebookAdminService,
    FacebookInboundProcessor,
    FacebookAssistantProcessor,
  ],
})
export class FacebookModule {}
