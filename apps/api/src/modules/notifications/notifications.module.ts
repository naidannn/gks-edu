import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { NOTIFICATION_QUEUE, REMINDER_SWEEP_QUEUE } from '../../queue/queue.constants.js';
import { SmsModule } from '../../sms/sms.module.js';
import { AdmissionsModule } from '../admissions/admissions.module.js';
import { EmailService } from './email.service.js';
import { NotificationTemplatesService } from './notification-templates.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsProcessor } from './notifications.processor.js';
import { NotificationsService } from './notifications.service.js';
import { ReminderSweepsProcessor } from './reminder-sweeps.processor.js';
import { ReminderSweepsService } from './reminder-sweeps.service.js';
import { SlackService } from './slack.service.js';
import { SmsBudgetService } from './sms-budget.service.js';

/**
 * Global: half the domain modules raise notifications, and threading an import
 * through every one of them buys nothing (1G-02).
 */
@Global()
@Module({
  imports: [
    SmsModule,
    // The daily sweep reads the admissions reminder ladder (1H-09).
    AdmissionsModule,
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
    SlackService,
    SmsBudgetService,
  ],
  exports: [NotificationsService, NotificationTemplatesService, ReminderSweepsService, EmailService, SlackService],
})
export class NotificationsModule {}
