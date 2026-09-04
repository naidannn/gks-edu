import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 1G-03 — email channel.
 *
 * Resend over plain HTTP: one endpoint, no SDK, no native dependency to add to
 * `allowBuilds`. With no `RESEND_API_KEY` the service logs the message instead
 * of sending, so development and tests never post real mail.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('notifications.resendApiKey'));
  }

  async send(to: string, subject: string, body: string): Promise<void> {
    const apiKey = this.config.get<string>('notifications.resendApiKey');
    const from = this.config.get<string>('notifications.fromEmail') ?? 'GKSedu <noreply@gksedu.mn>';

    if (!apiKey) {
      this.logger.log(`[EMAIL→${to}] ${subject}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text: body, html: toHtml(subject, body) }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend ${response.status}: ${detail.slice(0, 300)}`);
    }
  }
}

/**
 * Minimal Mongolian-friendly HTML wrapper. Deliberately inline-styled and
 * table-free — mail clients that strip `<style>` still render it sanely.
 */
function toHtml(subject: string, body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return [
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;',
    'font-size:15px;color:#1c1c1e;max-width:560px;margin:0 auto;padding:24px">',
    `<h1 style="font-size:18px;margin:0 0 20px">${escapeHtml(subject)}</h1>`,
    paragraphs,
    '<hr style="border:none;border-top:1px solid #e5e5ea;margin:24px 0">',
    '<p style="font-size:12px;color:#8e8e93;margin:0">',
    'Энэ мэдэгдлийг GKSedu.mn системээс автоматаар илгээв.',
    '</p></div>',
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
