import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The pure half of the Facebook channel (2F) — signature, Meta's messaging
 * window, and turning an answer into something Messenger can show. Kept free of
 * Nest and Prisma so each rule is a table of cases in a test.
 */

// ─── webhook signature ────────────────────────────────────────────────────────

/**
 * Whether `X-Hub-Signature-256` is Meta's HMAC of exactly these bytes.
 *
 * The raw body, not `JSON.stringify(req.body)`: Meta signs what it sent, and a
 * parsed-then-serialised object differs from it in escaping (`é` vs `é`)
 * and key order often enough that the check would fail on real traffic and pass
 * only on the test fixtures.
 */
export function verifySignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=') || !appSecret) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const given = Buffer.from(header.slice('sha256='.length), 'utf8');
  const want = Buffer.from(expected, 'utf8');

  return given.length === want.length && timingSafeEqual(given, want);
}

// ─── the messaging window ────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
export const STANDARD_WINDOW_MS = 24 * HOUR_MS;
export const HUMAN_AGENT_WINDOW_MS = 7 * 24 * HOUR_MS;

export type MessagingWindow = 'OPEN' | 'HUMAN_AGENT' | 'CLOSED';

/**
 * Meta's rule for a Page writing to a person: freely for 24 hours after their
 * last message, as a human agent for 7 days, then not at all until they write
 * again. Measured from the contact's message, not ours — replying does not
 * extend it.
 */
export function messagingWindow(lastInboundAt: Date | null, now: Date = new Date()): MessagingWindow {
  if (!lastInboundAt) return 'CLOSED';
  const age = now.getTime() - lastInboundAt.getTime();
  if (age <= STANDARD_WINDOW_MS) return 'OPEN';
  if (age <= HUMAN_AGENT_WINDOW_MS) return 'HUMAN_AGENT';
  return 'CLOSED';
}

/** Whether the assistant would answer this thread's next message right now. */
export function assistantActive(
  thread: { aiMode: 'AUTO' | 'OFF'; aiPausedUntil: Date | null },
  config: { enabled: boolean; facebookEnabled: boolean },
  now: Date = new Date(),
): boolean {
  if (!config.enabled || !config.facebookEnabled) return false;
  if (thread.aiMode !== 'AUTO') return false;
  return !thread.aiPausedUntil || thread.aiPausedUntil.getTime() <= now.getTime();
}

// ─── text for Messenger ───────────────────────────────────────────────────────

/** Meta's limit for one text message. */
export const MESSENGER_TEXT_LIMIT = 2_000;

/**
 * The stored answer, as Messenger can show it.
 *
 * The model is told to write plain text on this channel, but it is a model:
 * the odd `**тод**` still arrives, and Messenger would print the asterisks. The
 * `[K1]`/`[T2]` markers go too — they mean something in the widget, where the
 * sources list sits under the answer, and nothing in a chat bubble. The stored
 * answer keeps them, because the guard and the transcript read that one.
 */
export function toMessengerText(answer: string): string {
  return (
    answer
      // Citation markers, with the space that preceded them: "120 сая₮ [T1]." → "120 сая₮."
      .replace(/\s*\[(?:[KT]\d+)(?:\s*,\s*[KT]\d+)*\]/g, '')
      // [label](https://…) → label: https://…
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
      // Headings, bold, italics, inline code.
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1')
      // Markdown bullets → a bullet Messenger renders as one.
      .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Splits text into Messenger-sized messages, at paragraph, then line, then
 * sentence boundaries — never through a word unless one word is the whole limit.
 */
export function splitForMessenger(text: string, limit: number = MESSENGER_TEXT_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text.trim();

  while (rest.length > limit) {
    const window = rest.slice(0, limit);
    const cut =
      lastBreak(window, '\n\n') ?? lastBreak(window, '\n') ?? lastSentence(window) ?? lastBreak(window, ' ') ?? limit;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  if (rest) parts.push(rest);
  return parts;
}

/** A cut this early would leave a sliver of a message; it is not worth having. */
const MIN_CUT_RATIO = 0.5;

function lastBreak(window: string, separator: string): number | null {
  const at = window.lastIndexOf(separator);
  return at >= window.length * MIN_CUT_RATIO ? at + separator.length : null;
}

function lastSentence(window: string): number | null {
  const matches = [...window.matchAll(/[.!?](?=\s)/g)];
  const at = matches.at(-1)?.index;
  return at !== undefined && at >= window.length * MIN_CUT_RATIO ? at + 1 : null;
}

/** A one-line preview for the inbox list. */
export function preview(text: string | null, attachments: { type: string }[] = []): string | null {
  const line = text?.replace(/\s+/g, ' ').trim();
  if (line) return line.slice(0, 140);
  if (attachments.length) return attachments[0]!.type === 'image' ? '📷 Зураг' : '📎 Файл';
  return null;
}

// ─── comments ─────────────────────────────────────────────────────────────────

/**
 * Whether a comment is something to answer.
 *
 * Half of what lands under a post is a friend tagged, an emoji, or "😍😍" —
 * answering those with "дэлгэрэнгүйг inbox-оор илгээлээ" is spam with our name
 * on it, and each one is a private reply Meta lets us send exactly once. What
 * survives is anything with a couple of words, or the short asks people really
 * type: "үнэ?", "инфо", "мэдээлэл".
 */
export function isAnswerableComment(text: string, mentionCount = 0): boolean {
  const words = text
    // Tagged names arrive as plain text in the message; the webhook says how many.
    .replace(/@\S+/g, ' ')
    .replace(/[^\p{L}\p{N}\s?]/gu, ' ')
    .trim();

  const letters = words.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return false;

  // Only names, nothing else: "Бат Дорж" under a post is somebody being shown it.
  if (mentionCount > 0 && words.split(/\s+/).length <= mentionCount * 2 && !words.includes('?')) return false;

  return true;
}
