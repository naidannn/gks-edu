import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { NOTIFICATION_QUEUE, REMINDER_SWEEP_QUEUE } from '../../queue/queue.constants.js';
import { SmsModule } from '../../sms/sms.module.js';
import { EmailService } from './email.service.js';
import { NotificationTemplatesService } from './notification-templates.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NotificationsService } from './notifications.service.js';
import { ReminderSweepsProcessor } from './reminder-sweeps.processor.js';
import { ReminderSweepsService } from './reminder-sweeps.service.js';
import { SmsBudgetService } from './sms-budget.service.js';

/**
 * Global: half the domain modules raise notifications, and threading an import
 * through every one of them buys nothing (1G-02).
 */
@Global()
@Module({
  imports: [
    SmsModule,
    BullModule.registerQueue({ name: NOTIFICATION_QUEUE }, { name: REMINDER_SWEEP_QUEUE }),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationTemplatesService,
    ReminderSweepsService,
    ReminderSweepsProcessor,
    NotificationsProcessor,
    EmailService,
    SmsBudgetService,
  ],
  exports: [NotificationsService, NotificationTemplatesService, ReminderSweepsService, EmailService],
})
export class NotificationsModule {}
