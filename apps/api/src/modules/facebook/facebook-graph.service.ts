import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

/** What the Send API returns for a delivered message. */
export interface SentMessage {
  /** The page-scoped id the message went to — for a private reply, the first time we learn it. */
  recipientId: string;
  messageId: string;
}

/** Marks a message we sent, so its echo can be told apart from a person in Business Suite. */
export const OUR_ECHO_METADATA = 'gksedu';

/**
 * How a message may be sent, given Meta's window (2F).
 *
 * `RESPONSE` inside 24 hours of the contact's last message; `HUMAN_AGENT` — a
 * person, not a bot, answering late — up to seven days. The assistant only ever
 * sends `RESPONSE`: it answers what was just asked, and a bot using the human
 * tag is exactly what Meta revokes the permission for.
 */
export type SendMode = 'RESPONSE' | 'HUMAN_AGENT';

/**
 * The Graph API, as far as the Page needs it (2F): send a message, answer a
 * comment publicly or privately, read a profile and a post.
 *
 * With no Page token it logs instead of sending and hands back invented ids —
 * the same arrangement as `MetaCapiService` and `QPAY_MOCK`, so the inbox, the
 * assistant and the tests all run in dev without a Page to send from.
 *
 * The token goes in the body of every POST rather than the query string: a URL
 * ends up in access logs and error messages, and this one speaks as the Page.
 */
@Injectable()
export class FacebookGraphService {
  private readonly logger = new Logger(FacebookGraphService.name);

  constructor(private readonly config: ConfigService) {}

  get pageId(): string {
    return this.config.get<string>('facebook.pageId') ?? '';
  }

  get configured(): boolean {
    return Boolean(this.pageId && this.token);
  }

  get mock(): boolean {
    return !this.token;
  }

  private get token(): string {
    return this.config.get<string>('facebook.pageAccessToken') ?? '';
  }

  private get base(): string {
    return `https://graph.facebook.com/${this.config.get<string>('meta.graphVersion') ?? 'v26.0'}`;
  }

  async sendText(psid: string, text: string, mode: SendMode = 'RESPONSE'): Promise<SentMessage> {
    return this.send({
      recipient: { id: psid },
      ...(mode === 'HUMAN_AGENT'
        ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
        : { messaging_type: 'RESPONSE' }),
      message: { text, metadata: OUR_ECHO_METADATA },
    });
  }

  /**
   * A private reply: a Messenger message to whoever wrote the comment. Meta
   * allows one per comment, within seven days of it, and the response is the
   * only place the commenter's page-scoped id ever appears.
   */
  async privateReply(commentId: string, text: string): Promise<SentMessage> {
    return this.send({
      recipient: { comment_id: commentId },
      message: { text, metadata: OUR_ECHO_METADATA },
    });
  }

  /** A public reply under a comment. Returns the new comment's id. */
  async replyToComment(commentId: string, text: string): Promise<string> {
    if (this.mock) {
      this.logger.debug(`[mock] comment ${commentId} ← ${text.slice(0, 80)}`);
      return `mock_comment_${randomUUID()}`;
    }

    const payload = await this.post<{ id: string }>(`/${encodeURIComponent(commentId)}/comments`, { message: text });
    return payload.id;
  }

  /** "Typing…" in the contact's window while the assistant thinks. Best effort. */
  async typing(psid: string): Promise<void> {
    if (this.mock) return;
    try {
      await this.post(`/${this.pageId}/messages`, { recipient: { id: psid }, sender_action: 'typing_on' });
    } catch (error) {
      this.logger.debug(`typing_on амжилтгүй: ${describe(error)}`);
    }
  }

  /** Name and picture. Null when Meta will not say — a private profile is common. */
  async profile(psid: string): Promise<{ name: string | null; profilePic: string | null } | null> {
    if (this.mock) return null;
    try {
      const data = await this.get<{ first_name?: string; last_name?: string; name?: string; profile_pic?: string }>(
        `/${encodeURIComponent(psid)}`,
        { fields: 'first_name,last_name,profile_pic' },
      );
      const name = data.name ?? [data.first_name, data.last_name].filter(Boolean).join(' ');
      return { name: name || null, profilePic: data.profile_pic ?? null };
    } catch (error) {
      this.logger.warn(`Facebook профайл уншигдсангүй: ${describe(error)}`);
      return null;
    }
  }

  /** A post's text and link, for the comment's context. Null on any failure. */
  async postInfo(postId: string): Promise<{ message: string | null; permalink: string | null } | null> {
    if (this.mock) return null;
    try {
      const data = await this.get<{ message?: string; permalink_url?: string }>(`/${encodeURIComponent(postId)}`, {
        fields: 'message,permalink_url',
      });
      return { message: data.message ?? null, permalink: data.permalink_url ?? null };
    } catch (error) {
      this.logger.warn(`Facebook пост уншигдсангүй: ${describe(error)}`);
      return null;
    }
  }

  // ─── transport ──────────────────────────────────────────────────────────────

  private async send(body: Record<string, unknown>): Promise<SentMessage> {
    if (this.mock) {
      const recipient = body.recipient as { id?: string; comment_id?: string };
      const text = ((body.message as { text?: string } | undefined)?.text ?? '').slice(0, 80);
      this.logger.debug(`[mock] Messenger ${recipient.id ?? `comment:${recipient.comment_id}`} ← ${text}`);
      // A private reply in mock mode has nobody to land with, so the commenter
      // gets a stable invented id: the same comment twice is the same person.
      return {
        recipientId: recipient.id ?? `mock_psid_${recipient.comment_id}`,
        messageId: `mock_mid_${randomUUID()}`,
      };
    }

    const payload = await this.post<{ recipient_id: string; message_id: string }>(`/${this.pageId}/messages`, body);
    return { recipientId: payload.recipient_id, messageId: payload.message_id };
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: this.token }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.read<T>(response);
  }

  private async get<T>(path: string, query: Record<string, string>): Promise<T> {
    // A GET has nowhere else to carry the token. The URL is never logged:
    // errors are reported from Meta's body, not from the request.
    const params = new URLSearchParams({ ...query, access_token: this.token });
    const response = await fetch(`${this.base}${path}?${params}`, { signal: AbortSignal.timeout(this.timeoutMs) });
    return this.read<T>(response);
  }

  private async read<T>(response: Response): Promise<T> {
    const payload = (await response.json().catch(() => ({}))) as T & { error?: GraphErrorBody };
    if (!response.ok || payload.error) {
      throw new FacebookGraphError(payload.error ?? { message: `HTTP ${response.status}` }, response.status);
    }
    return payload;
  }

  private get timeoutMs(): number {
    return this.config.get<number>('facebook.timeoutMs') ?? 15_000;
  }
}

interface GraphErrorBody {
  message?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
}

/**
 * A refusal from the Graph API, with enough of Meta's body kept to decide what
 * to do about it: retry (rate limit, Meta's own outage) or give up and show
 * staff the reason (outside the window, the person blocked the Page, the
 * comment was deleted).
 */
export class FacebookGraphError extends Error {
  readonly code: number | undefined;
  readonly subcode: number | undefined;
  readonly status: number;
  /** Worth retrying: rate limited, or Meta's own trouble. */
  readonly transient: boolean;

  constructor(body: GraphErrorBody, status: number) {
    super(body.message ?? 'Facebook-ийн алдаа');
    this.name = 'FacebookGraphError';
    this.code = body.code;
    this.subcode = body.error_subcode;
    this.status = status;
    this.transient = status >= 500 || status === 429 || body.is_transient === true || body.code === 2 || body.code === 4;
  }

  /** What staff read on the failed bubble — Meta's English, prefixed in ours. */
  get staffMessage(): string {
    if (this.code === 10 && this.subcode === 2018278) return 'Facebook-ийн 24 цагийн хугацаа өнгөрсөн тул илгээгдсэнгүй';
    if (this.code === 551) return 'Энэ хүн одоогоор мессеж хүлээж авахгүй байна (Page-ийг хаасан байж магадгүй)';
    if (this.code === 10 && this.subcode === 2018108) return 'Энэ сэтгэгдэлд private reply аль хэдийн илгээгдсэн эсвэл 7 хоног өнгөрсөн';
    return `Facebook татгалзлаа: ${this.message}`;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
