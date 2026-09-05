import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationChannel, NotificationStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SmsService } from '../../sms/sms.service.js';
import { NOTIFICATION_QUEUE } from '../../queue/queue.constants.js';
import { EmailService } from './email.service.js';
import { presentationFor } from './email/email-presentation.js';
import { SmsBudgetService } from './sms-budget.service.js';

/**
 * Delivers one `Notification` row (1G-02). Failures throw so BullMQ retries;
 * the row records the last error either way, which is what the admin screen
 * shows.
 */
@Processor(NOTIFICATION_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly budget: SmsBudgetService,
  ) {
    super();
  }

  async process(job: Job<{ notificationId: string }>): Promise<void> {
    const { notificationId } = job.data;

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: { user: { select: { email: true, phone: true } } },
    });

    if (!notification || notification.status !== NotificationStatus.PENDING) return;

    try {
      switch (notification.channel) {
        case NotificationChannel.EMAIL: {
          if (!notification.user.email) return void (await this.skip(notificationId, 'Имэйл хаяггүй'));
          const look = presentationFor(notification.event, toneOf(notification.meta));
          await this.email.send(
            notification.user.email,
            {
              subject: notification.title,
              eyebrow: look.eyebrow,
              tone: look.tone,
              body: notification.body,
              cta: notification.link ? { label: look.ctaLabel, url: notification.link } : null,
            },
            notification.event,
          );
          break;
        }
        case NotificationChannel.SMS: {
          if (!notification.user.phone) return void (await this.skip(notificationId, 'Утасны дугааргүй'));
          const blocked = await this.budget.blockReason(notification.userId);
          if (blocked) return void (await this.skip(notificationId, blocked));
          await this.sms.send(notification.user.phone, notification.body);
          break;
        }
        default:
          return void (await this.skip(notificationId, 'Суваг дэмжигдээгүй'));
      }

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      await this.prisma.notification.update({
        where: { id: notificationId },
        data: {
          attempts: { increment: 1 },
          failedReason: reason.slice(0, 500),
          ...(lastAttempt ? { status: NotificationStatus.FAILED } : {}),
        },
      });

      this.logger.error(`Мэдэгдэл хүргэж чадсангүй (${notificationId}): ${reason}`);
      throw error;
    }
  }

  private async skip(id: string, reason: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.SKIPPED, failedReason: reason },
    });
  }
}

/** `meta` is a JSON column; a dispatcher may put a tone override in it. */
function toneOf(meta: unknown): unknown {
  return typeof meta === 'object' && meta !== null ? (meta as { tone?: unknown }).tone : undefined;
}
