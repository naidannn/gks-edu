import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';

/**
 * Slack sits inline in a request (a registration, a signed contract), not on
 * the notification queue, so it must never hold the caller up for long.
 */
const REQUEST_TIMEOUT_MS = 5_000;

export interface SlackField {
  label: string;
  /** Empty, `null` and `undefined` values drop the whole line rather than printing "—". */
  value: string | number | null | undefined;
}

export interface SlackMessage {
  /** Leading emoji — the office scans the channel by icon. */
  emoji: string;
  title: string;
  fields?: SlackField[];
  /** A path is resolved against `APP_PUBLIC_URL`; an absolute URL is left alone. */
  link?: { label: string; path: string };
}

/**
 * The office's Slack channel — a staff-side broadcast for the handful of
 * events somebody should react to within minutes: a consultation request, a
 * new account, a signed contract, a payment that landed.
 *
 * Deliberately *not* a `NotificationChannel`. The dispatcher addresses named
 * recipients and renders an admin-editable template per user; this addresses
 * one room and nobody's preferences apply to it. Threading it through
 * `Notification` rows would mean a row per staff member for a message that is
 * posted once.
 *
 * With `SLACK_BOT_TOKEN` unset the service logs instead of posting, so
 * development and tests never write into the real channel — the same
 * arrangement as {@link EmailService}.
 */
@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.token && this.channel);
  }

  /**
   * Fire-and-forget: a business action must not fail because Slack is down,
   * so every error is logged and swallowed (1G-02's rule for the dispatcher).
   */
  async notify(message: SlackMessage): Promise<void> {
    try {
      await this.post(message);
    } catch (error) {
      this.logger.warn(
        `Slack мэдэгдэл илгээгдсэнгүй ("${message.title}"): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async post(message: SlackMessage): Promise<void> {
    const summary = `${message.emoji} ${message.title}`;
    const body = this.renderMrkdwn(message);

    if (!this.enabled) {
      this.logger.log(`[SLACK] ${body}`);
      return;
    }

    const response = await fetch(POST_MESSAGE_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel: this.channel,
        // `text` is what the desktop/mobile push preview shows; the blocks are
        // what the channel renders.
        text: summary,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: body } }],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`Slack HTTP ${response.status}`);

    // Slack answers 200 even when it refuses the call — `ok: false` with a
    // reason like `invalid_auth` or `not_in_channel` is the real status.
    const result = (await response.json()) as { ok?: boolean; error?: string };
    if (!result.ok) throw new Error(`Slack API: ${result.error ?? 'unknown_error'}`);
  }

  /** Exported shape of a message, and the exact text the no-token path logs. */
  renderMrkdwn(message: SlackMessage): string {
    const lines = [`*${escapeMrkdwn(`${message.emoji} ${message.title}`)}*`];

    for (const field of message.fields ?? []) {
      if (field.value === null || field.value === undefined || field.value === '') continue;
      lines.push(`• *${escapeMrkdwn(field.label)}:* ${escapeMrkdwn(String(field.value))}`);
    }

    if (message.link) {
      lines.push(`<${this.absoluteLink(message.link.path)}|${escapeMrkdwn(message.link.label)}>`);
    }

    return lines.join('\n');
  }

  private absoluteLink(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = (this.config.get<string>('notifications.appUrl') ?? '').replace(/\/$/, '');
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private get token(): string {
    return this.config.get<string>('notifications.slack.botToken') ?? '';
  }

  private get channel(): string {
    return this.config.get<string>('notifications.slack.channelId') ?? '';
  }
}

/** Slack's mrkdwn reserves these three; everything else is literal. */
function escapeMrkdwn(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
