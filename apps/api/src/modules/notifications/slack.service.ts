import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SLACK_API = 'https://slack.com/api';

/**
 * Slack sits inline in a request (a registration, a signed contract), not on
 * the notification queue, so it must never hold the caller up for long.
 */
const REQUEST_TIMEOUT_MS = 5_000;

/**
 * One channel per kind of event, so the office can mute payments without
 * missing a consultation request. The bot creates a channel the first time it
 * needs one and joins it if somebody else made it — nobody has to invite it.
 * Renaming one here makes a new, empty channel; the old one stays behind.
 */
export const SLACK_CHANNELS = {
  leads: 'web-leads',
  signups: 'web-signups',
  contracts: 'web-contracts',
  payments: 'web-payments',
  chat: 'web-chat',
  ai: 'web-ai-alerts',
} as const;

export type SlackTopic = keyof typeof SLACK_CHANNELS;

export interface SlackField {
  label: string;
  /** Empty, `null` and `undefined` values drop the whole line rather than printing "—". */
  value: string | number | null | undefined;
}

export interface SlackMessage {
  /** Which channel it lands in. */
  topic: SlackTopic;
  /** Leading emoji — the office scans the channel by icon. */
  emoji: string;
  title: string;
  fields?: SlackField[];
  /** A path is resolved against `APP_PUBLIC_URL`; an absolute URL is left alone. */
  link?: { label: string; path: string };
}

/**
 * The office's Slack workspace — a staff-side broadcast for the handful of
 * events somebody should react to within minutes: a consultation request, a
 * new account, a signed contract, a payment that landed. Each kind goes to its
 * own channel ({@link SLACK_CHANNELS}).
 *
 * Deliberately *not* a `NotificationChannel`. The dispatcher addresses named
 * recipients and renders an admin-editable template per user; this addresses
 * rooms, and nobody's preferences apply to it. Threading it through
 * `Notification` rows would mean a row per staff member for a message that is
 * posted once.
 *
 * With `SLACK_BOT_TOKEN` unset the service logs instead of posting, so
 * development and tests never write into the real channel — the same
 * arrangement as {@link EmailService}.
 */
@Injectable()
export class SlackService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlackService.name);
  /** Channel name → id, resolved once per process. A failed lookup is forgotten so the next message retries it. */
  private readonly channelIds = new Map<string, Promise<string>>();

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.token);
  }

  /**
   * Make every channel exist right after a deploy instead of on its first
   * event — a channel that appears the day the first double payment happens is
   * one nobody has joined. In the background: boot must not wait on Slack.
   */
  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void (async () => {
      for (const name of Object.values(SLACK_CHANNELS)) {
        await this.channelId(name).catch((error: unknown) =>
          this.logger.warn(`Slack #${name} суваг бэлдэж чадсангүй: ${errorMessage(error)}`),
        );
      }
    })();
  }

  /**
   * Fire-and-forget: a business action must not fail because Slack is down,
   * so every error is logged and swallowed (1G-02's rule for the dispatcher).
   */
  async notify(message: SlackMessage): Promise<void> {
    try {
      await this.post(message);
    } catch (error) {
      this.logger.warn(`Slack мэдэгдэл илгээгдсэнгүй ("${message.title}"): ${errorMessage(error)}`);
    }
  }

  private async post(message: SlackMessage): Promise<void> {
    const summary = `${message.emoji} ${message.title}`;
    const body = this.renderMrkdwn(message);

    if (!this.enabled) {
      this.logger.log(`[SLACK] ${body}`);
      return;
    }

    await this.call('chat.postMessage', {
      channel: await this.channelId(SLACK_CHANNELS[message.topic]),
      // `text` is what the desktop/mobile push preview shows; the blocks are
      // what the channel renders.
      text: summary,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: body } }],
    });
  }

  private channelId(name: string): Promise<string> {
    let id = this.channelIds.get(name);
    if (!id) {
      id = this.resolveChannel(name);
      this.channelIds.set(name, id);
      id.catch(() => this.channelIds.delete(name));
    }
    return id;
  }

  /** Find the public channel by name, join it, or create it — the creator is a member already. */
  private async resolveChannel(name: string): Promise<string> {
    let channel = await this.findChannel(name);
    if (!channel) {
      try {
        const created = await this.call<{ channel: SlackChannel }>('conversations.create', { name });
        this.logger.log(`Slack #${name} суваг үүсгэлээ`);
        return created.channel.id;
      } catch (error) {
        // The other API instance made it a moment ago.
        if (!(error instanceof Error && error.message.endsWith('name_taken'))) throw error;
        channel = await this.findChannel(name);
        if (!channel) throw error;
      }
    }
    // An archived channel cannot be posted to; unarchiving is a person's call.
    if (channel.is_archived) throw new Error(`#${name} архивлагдсан байна`);
    if (!channel.is_member) await this.call('conversations.join', { channel: channel.id });
    return channel.id;
  }

  private async findChannel(name: string): Promise<SlackChannel | undefined> {
    let cursor = '';
    do {
      const page = await this.call<{ channels: SlackChannel[]; response_metadata?: { next_cursor?: string } }>(
        'conversations.list',
        { types: 'public_channel', exclude_archived: false, limit: 1000, ...(cursor ? { cursor } : {}) },
      );
      const match = page.channels.find((channel) => channel.name === name);
      if (match) return match;
      cursor = page.response_metadata?.next_cursor ?? '';
    } while (cursor);
    return undefined;
  }

  /**
   * Form-encoded, not JSON: read methods like `conversations.list` silently
   * ignore a JSON body's arguments — `cursor` included, so paging never ends.
   */
  private async call<T = unknown>(method: string, args: Record<string, unknown>): Promise<T> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(args)) {
      body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const response = await fetch(`${SLACK_API}/${method}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}` },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) throw new Error(`Slack HTTP ${response.status}`);

    // Slack answers 200 even when it refuses the call — `ok: false` with a
    // reason like `invalid_auth` or `missing_scope` is the real status.
    const result = (await response.json()) as { ok?: boolean; error?: string } & T;
    if (!result.ok) throw new Error(`Slack API ${method}: ${result.error ?? 'unknown_error'}`);
    return result;
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
}

interface SlackChannel {
  id: string;
  name: string;
  is_member?: boolean;
  is_archived?: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Slack's mrkdwn reserves these three; everything else is literal. */
function escapeMrkdwn(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
