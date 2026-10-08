import type { FacebookAttachmentRow } from './facebook.types.js';
import { OUR_ECHO_METADATA } from './facebook-graph.service.js';

/**
 * The Page webhook, as Meta sends it (2F) — only the fields we read.
 *
 * https://developers.facebook.com/docs/messenger-platform/webhooks
 * https://developers.facebook.com/docs/graph-api/webhooks/reference/page/#feed
 */
export interface PageWebhookBody {
  object?: string;
  entry?: PageEntry[];
}

export interface PageEntry {
  /** The Page's id. */
  id?: string;
  time?: number;
  messaging?: MessagingEvent[];
  changes?: { field?: string; value?: FeedValue }[];
}

interface MessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number | string;
    metadata?: string;
    attachments?: { type?: string; payload?: { url?: string; sticker_id?: number } }[];
    referral?: Referral;
  };
  postback?: { mid?: string; title?: string; payload?: string; referral?: Referral };
  referral?: Referral;
}

interface Referral {
  ref?: string;
  source?: string;
  type?: string;
  ad_id?: string;
}

interface FeedValue {
  item?: string;
  verb?: string;
  comment_id?: string;
  post_id?: string;
  parent_id?: string;
  from?: { id?: string; name?: string };
  message?: string;
  created_time?: number | string;
}

/** One thing that happened on the Page, in the shape the intake stores. */
export type PageEvent =
  | {
      kind: 'message';
      psid: string;
      mid: string;
      text: string | null;
      attachments: FacebookAttachmentRow[];
      at: Date;
      referral: Record<string, string> | null;
    }
  | {
      kind: 'echo';
      /** The contact it was sent to. */
      psid: string;
      mid: string;
      text: string | null;
      attachments: FacebookAttachmentRow[];
      at: Date;
      /** Sent through our app, not typed by a person in Business Suite. */
      ours: boolean;
    }
  | { kind: 'referral'; psid: string; at: Date; referral: Record<string, string> }
  | {
      kind: 'comment';
      commentId: string;
      postId: string;
      parentId: string | null;
      fromId: string;
      fromName: string | null;
      text: string;
      at: Date;
    }
  | { kind: 'comment_removed'; commentId: string };

/**
 * Flattens one webhook entry into the events we act on.
 *
 * Everything else is dropped here, on purpose and in one place: delivery and
 * read receipts (nothing in the inbox needs them yet), comment edits, likes,
 * reactions, posts, and anything addressed to a Page that is not ours — a Meta
 * app can be subscribed to several, and a stray entry must not land in this
 * office's inbox.
 */
export function pageEvents(entry: PageEntry, opts: { pageId: string; appId: string }): PageEvent[] {
  if (opts.pageId && entry.id && entry.id !== opts.pageId) return [];

  const events: PageEvent[] = [];

  for (const item of entry.messaging ?? []) {
    const at = new Date(item.timestamp ?? Date.now());
    const message = item.message;

    if (message?.is_echo) {
      const psid = item.recipient?.id;
      if (!psid || !message.mid) continue;
      events.push({
        kind: 'echo',
        psid,
        mid: message.mid,
        text: message.text ?? null,
        attachments: attachmentsOf(message.attachments),
        at,
        ours:
          message.metadata === OUR_ECHO_METADATA ||
          (Boolean(opts.appId) && message.app_id !== undefined && String(message.app_id) === opts.appId),
      });
      continue;
    }

    const psid = item.sender?.id;
    if (!psid || psid === opts.pageId) continue;

    if (message?.mid) {
      events.push({
        kind: 'message',
        psid,
        mid: message.mid,
        text: message.text ?? null,
        attachments: attachmentsOf(message.attachments),
        at,
        referral: referralOf(message.referral),
      });
    } else if (item.postback) {
      // A button press is the person saying the button's words. Postbacks
      // without a mid (older payloads) get one made from the timestamp, so a
      // retried webhook still collapses onto the same row.
      events.push({
        kind: 'message',
        psid,
        mid: item.postback.mid ?? `postback:${psid}:${item.timestamp ?? at.getTime()}`,
        text: item.postback.title ?? item.postback.payload ?? null,
        attachments: [],
        at,
        referral: referralOf(item.postback.referral),
      });
    } else if (item.referral) {
      const referral = referralOf(item.referral);
      if (referral) events.push({ kind: 'referral', psid, at, referral });
    }
  }

  for (const change of entry.changes ?? []) {
    const value = change.value;
    if (change.field !== 'feed' || value?.item !== 'comment' || !value.comment_id) continue;

    if (value.verb === 'remove') {
      events.push({ kind: 'comment_removed', commentId: value.comment_id });
      continue;
    }
    if (value.verb !== 'add') continue;

    const fromId = value.from?.id;
    // The Page's own comments — ours, or staff typing on Facebook — are not questions.
    if (!fromId || fromId === opts.pageId || !value.post_id) continue;

    events.push({
      kind: 'comment',
      commentId: value.comment_id,
      postId: value.post_id,
      // A top-level comment's parent is the post itself; only a reply has a real parent.
      parentId: value.parent_id && value.parent_id !== value.post_id ? value.parent_id : null,
      fromId,
      fromName: value.from?.name ?? null,
      text: value.message ?? '',
      at: timeOf(value.created_time),
    });
  }

  return events;
}

function attachmentsOf(raw: { type?: string; payload?: { url?: string; sticker_id?: number } }[] | undefined) {
  return (raw ?? []).map(
    (attachment): FacebookAttachmentRow => ({
      type: attachment.payload?.sticker_id
        ? 'sticker'
        : (['image', 'video', 'audio', 'file'] as const).find((type) => type === attachment.type) ?? 'other',
      url: attachment.payload?.url ?? null,
    }),
  );
}

function referralOf(raw: Referral | undefined): Record<string, string> | null {
  if (!raw) return null;
  const referral = Object.fromEntries(
    Object.entries({ ref: raw.ref, source: raw.source, type: raw.type, ad_id: raw.ad_id }).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
    ),
  );
  return Object.keys(referral).length ? referral : null;
}

/** Feed timestamps are Unix seconds; Messenger's are milliseconds. */
function timeOf(raw: number | string | undefined): Date {
  if (raw === undefined) return new Date();
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(value) ? new Date(value < 1e12 ? value * 1000 : value) : new Date();
}
