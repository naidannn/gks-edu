import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderEmail, type EmailMessage } from '../notifications/email/email-template.js';

/**
 * 1O — the marketing rail.
 *
 * Brevo over plain HTTP, for the same reason `EmailService` talks to Resend
 * that way: one endpoint, no SDK, no native dependency to add to `allowBuilds`.
 * With no `BREVO_API_KEY` the service logs instead of sending, so development
 * and tests never post real mail to a real list.
 *
 * Two providers, on purpose. Resend carries the mail a person is waiting for —
 * a login link, an OTP, "төлбөр баталгаажлаа". Brevo carries the mail nobody
 * asked for today. If one stream poisons a sending reputation it must not be
 * the one that carries the password reset.
 *
 * What they *do* share is `renderEmail`: a newsletter and a payment receipt
 * should look like the same company, and the layout is the only thing that
 * makes them so.
 */

export interface BrevoSendResult {
  messageId: string | null;
}

export interface BrevoContact {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Brevo contact attributes beyond the name — service, stage, school. */
  attributes?: Record<string, string | number | boolean | null>;
}

/** Brevo rejects a tag that is not a short plain word. */
const TAG_SAFE = /[^A-Za-z0-9_-]/g;

@Injectable()
export class BrevoService {
  private readonly logger = new Logger(BrevoService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('brevo.apiKey'));
  }

  /** 0 = no list configured; the contact sync is then a no-op, sending is not. */
  get listId(): number {
    return this.config.get<number>('brevo.listId') ?? 0;
  }

  /**
   * One campaign mail to one address.
   *
   * @param unsubscribeUrl Goes into the `List-Unsubscribe` header as well as
   *        the footer link. Gmail and Outlook show their own "unsubscribe"
   *        control from that header, and an inbox that offers one gets "report
   *        spam" pressed far less often — which is the whole ballgame for a
   *        sending domain that also carries login links.
   */
  async send(
    to: { email: string; name?: string | null },
    message: EmailMessage,
    options: { unsubscribeUrl?: string; tag?: string } = {},
  ): Promise<BrevoSendResult> {
    const apiKey = this.config.get<string>('brevo.apiKey');
    const appUrl = this.config.get<string>('notifications.appUrl') ?? 'https://gksedu.mn';
    const { html, text } = renderEmail(message, appUrl);

    if (!apiKey) {
      this.logger.log(`[BREVO→${to.email}] ${message.subject}\n${text}`);
      return { messageId: null };
    }

    const body: Record<string, unknown> = {
      sender: {
        email: this.config.get<string>('brevo.senderEmail'),
        name: this.config.get<string>('brevo.senderName'),
      },
      to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
      subject: message.subject,
      htmlContent: html,
      textContent: text,
    };

    const replyTo = this.config.get<string>('brevo.replyToEmail');
    if (replyTo) body.replyTo = { email: replyTo };

    if (options.unsubscribeUrl) {
      body.headers = {
        'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }
    if (options.tag) body.tags = [options.tag.replace(TAG_SAFE, '_').slice(0, 60)];

    const response = await this.request('/smtp/email', body);
    const payload = (await response.json().catch(() => ({}))) as { messageId?: string };
    return { messageId: payload.messageId ?? null };
  }

  /**
   * Create-or-update one contact in the configured list.
   *
   * `updateEnabled` is what makes this an upsert: without it Brevo answers 400
   * "Contact already exist" for everybody who ever subscribed, and a re-sync
   * would be a wall of errors rather than a no-op.
   */
  async upsertContact(contact: BrevoContact): Promise<void> {
    if (!this.enabled) {
      this.logger.log(`[BREVO contact] ${contact.email}`);
      return;
    }

    await this.request('/contacts', {
      email: contact.email,
      updateEnabled: true,
      ...(this.listId ? { listIds: [this.listId] } : {}),
      attributes: {
        ...(contact.firstName ? { FIRSTNAME: contact.firstName } : {}),
        ...(contact.lastName ? { LASTNAME: contact.lastName } : {}),
        ...(contact.attributes ?? {}),
      },
    });
  }

  /**
   * Bulk import — one call for the whole office list instead of one per row.
   *
   * Brevo runs this asynchronously and answers with a process id, so a success
   * here means "accepted", not "in the list". That is fine for what it is used
   * for (the nightly/manual sync); anything that must be certain about one
   * address uses `upsertContact`.
   */
  async importContacts(contacts: BrevoContact[]): Promise<number> {
    if (!contacts.length) return 0;
    if (!this.enabled || !this.listId) {
      this.logger.log(`[BREVO import] ${contacts.length} хаяг (илгээсэнгүй)`);
      return 0;
    }

    // Brevo caps one import payload; the office list is small, but a batch is
    // cheap insurance against the day it is not.
    const CHUNK = 500;
    let accepted = 0;

    for (let index = 0; index < contacts.length; index += CHUNK) {
      const chunk = contacts.slice(index, index + CHUNK);
      await this.request('/contacts/import', {
        listIds: [this.listId],
        updateExistingContacts: true,
        emptyContactsAttributes: false,
        jsonBody: chunk.map((contact) => ({
          email: contact.email,
          attributes: {
            ...(contact.firstName ? { FIRSTNAME: contact.firstName } : {}),
            ...(contact.lastName ? { LASTNAME: contact.lastName } : {}),
            ...(contact.attributes ?? {}),
          },
        })),
      });
      accepted += chunk.length;
    }

    return accepted;
  }

  /** Marks a contact unsubscribed in Brevo too, so a campaign built there skips them. */
  async blocklistContact(email: string): Promise<void> {
    if (!this.enabled) return;

    const baseUrl = this.config.get<string>('brevo.baseUrl');
    const response = await fetch(`${baseUrl}/contacts/${encodeURIComponent(email)}`, {
      method: 'PUT',
      headers: this.headers(),
      body: JSON.stringify({ emailBlacklisted: true }),
    });

    // An address Brevo has never seen is not an error here: the person
    // unsubscribed from a list that only ever existed on our side.
    if (!response.ok && response.status !== 404) {
      const detail = await response.text().catch(() => '');
      this.logger.warn(`Brevo blocklist ${response.status}: ${detail.slice(0, 200)}`);
    }
  }

  private headers(): Record<string, string> {
    return {
      'api-key': this.config.get<string>('brevo.apiKey') ?? '',
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  private async request(path: string, body: unknown): Promise<Response> {
    const baseUrl = this.config.get<string>('brevo.baseUrl');
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Brevo ${response.status}: ${detail.slice(0, 300)}`);
    }

    return response;
  }
}
