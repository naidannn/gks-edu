import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderEmail, type EmailMessage } from './email/email-template.js';

export type { EmailMessage } from './email/email-template.js';

/** Resend rejects tags whose value is not `[A-Za-z0-9_-]`. */
const TAG_SAFE = /[^A-Za-z0-9_-]/g;

/**
 * 1G-03 — email channel.
 *
 * Resend over plain HTTP: one endpoint, no SDK, no native dependency to add to
 * `allowBuilds`. With no `RESEND_API_KEY` the service logs the message instead
 * of sending, so development and tests never post real mail.
 *
 * Every message goes through `renderEmail`, so the layout is decided in one
 * place — see `email/email-template.ts` for why it looks the way it does.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('notifications.resendApiKey'));
  }

  /**
   * @param tag Groups the send in Resend's dashboard — the notification event,
   *            or the name of the transactional mail (`password_reset`).
   */
  async send(to: string, message: EmailMessage, tag?: string): Promise<void> {
    const apiKey = this.config.get<string>('notifications.resendApiKey');
    const from = this.config.get<string>('notifications.fromEmail') ?? 'GKSedu <noreply@gksedu.mn>';
    const replyTo = this.config.get<string>('notifications.replyToEmail');
    const appUrl = this.config.get<string>('notifications.appUrl') ?? 'https://gksedu.mn';

    const { html, text } = renderEmail(message, appUrl);

    if (!apiKey) {
      this.logger.log(`[EMAIL→${to}] ${message.subject}\n${text}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: message.subject,
        html,
        text,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(tag ? { tags: [{ name: 'kind', value: tag.replace(TAG_SAFE, '_').slice(0, 60) }] } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
    }
  }

  /** Absolute URL for a link inside an email — `{{link}}` is already absolute. */
  link(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = (this.config.get<string>('notifications.appUrl') ?? '').replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }
}
