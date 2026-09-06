import { Module } from '@nestjs/common';
import { AdminConversationsController } from './admin-conversations.controller.js';
import { MeConversationsController } from './me-conversations.controller.js';
import { MessengerController } from './messenger.controller.js';
import { MessengerEventsService } from './messenger-events.service.js';
import { MessengerService } from './messenger.service.js';

/**
 * 1K — live chat between a client and a real consultant.
 *
 * `NotificationsModule` is `@Global()`, so the dispatcher and Slack arrive
 * without an import here. `MessengerEventsService` is exported because it
 * holds the only live-connection registry in the process; nothing else needs
 * it yet, but a second module that wants to push into an open thread would.
 */
@Module({
  controllers: [MessengerController, MeConversationsController, AdminConversationsController],
  providers: [MessengerService, MessengerEventsService],
  exports: [MessengerService, MessengerEventsService],
})
export class MessengerModule {}
