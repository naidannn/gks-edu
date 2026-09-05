/**
 * Turns the plain-text notification body into a small block model the HTML
 * layout can lay out properly.
 *
 * Why parse instead of authoring HTML templates: `NotificationTemplate.bodyMn`
 * is edited by admins in a plain textarea, and the same string is the SMS and
 * in-app copy. So the text stays the single source, and the shapes staff
 * already write — `Нэр: утга` lines, `- ` bullets, a trailing link — are
 * promoted to a fact table, a list and a button. Anything unrecognised falls
 * back to a paragraph, so no edit can produce a broken email.
 */

export interface ParagraphBlock {
  kind: 'paragraph';
  lines: string[];
}

export interface FactsBlock {
  kind: 'facts';
  rows: { label: string; value: string }[];
}

export interface ListBlock {
  kind: 'list';
  items: string[];
}

export type EmailBlock = ParagraphBlock | FactsBlock | ListBlock;

export interface ParsedBody {
  blocks: EmailBlock[];
  /** First URL found in the text, if the caller did not pass an explicit link. */
  url: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;
/** `Нэр: утга` — a short label, then a non-empty value. */
const FACT_RE = /^\s*([^:：]{2,32})\s*[:：]\s+(\S.*)$/;
const BULLET_RE = /^\s*[-–—•·*]\s+(\S.*)$/;
/** Sign-offs the templates end with; the layout supplies its own. */
const SIGN_OFF = new Set(['GKS EDU GROUP', 'GKSedu', 'GKSedu.mn']);

export function parseEmailBody(body: string): ParsedBody {
  let url: string | null = null;

  const cleaned = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => {
      const found = line.match(URL_RE);
      if (!found) return line;
      url ??= found[0] ?? null;

      // Drop the URL and the punctuation that introduced it. What is left is
      // usually a stub that only existed to announce the link — "Кабинет:",
      // "QPay-ээр төлөх:" — and repeating it above the button reads as a
      // stutter, so anything that short goes too. A residue long enough to be
      // a real sentence stays.
      const residue = line.replace(URL_RE, '').replace(/[\s:：—–-]+$/, '').trim();
      return residue.split(/\s+/).length <= 3 ? '' : residue;
    })
    .filter((line, index, all) => !(SIGN_OFF.has(line.trim()) && index >= all.length - 3))
    .join('\n');

  const blocks: EmailBlock[] = [];

  for (const chunk of cleaned.split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    blocks.push(...segment(lines));
  }

  return { blocks: trimTrailingEmpty(blocks), url };
}

/**
 * Splits one chunk into runs of like-shaped lines, so a sentence followed by
 * three `Нэр: утга` lines becomes a paragraph *and* a fact table rather than
 * one lump of text.
 */
function segment(lines: string[]): EmailBlock[] {
  const blocks: EmailBlock[] = [];
  const last = (): EmailBlock | undefined => blocks[blocks.length - 1];

  for (const line of lines) {
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      const tail = last();
      if (tail?.kind === 'list') tail.items.push(bullet[1]!);
      else blocks.push({ kind: 'list', items: [bullet[1]!] });
      continue;
    }

    const fact = line.match(FACT_RE);
    if (fact && isLabelLike(fact[1]!)) {
      const row = { label: fact[1]!.trim(), value: fact[2]!.trim() };
      const tail = last();
      if (tail?.kind === 'facts') tail.rows.push(row);
      else blocks.push({ kind: 'facts', rows: [row] });
      continue;
    }

    const tail = last();
    if (tail?.kind === 'paragraph') tail.lines.push(line);
    else blocks.push({ kind: 'paragraph', lines: [line] });
  }

  return blocks;
}

/**
 * A fact label is a noun phrase, not a sentence: at most three words and no
 * closing punctuation. Without this, "Таны визний хариу бүртгэгдлээ: Виз
 * гарсан" would be filed away in a table instead of being read as the news.
 */
function isLabelLike(label: string): boolean {
  const trimmed = label.trim();
  if (/[.!?,]/.test(trimmed)) return false;
  return trimmed.split(/\s+/).length <= 3;
}

/** An em dash is the dispatcher's "no value"; a whole card of them says nothing. */
function trimTrailingEmpty(blocks: EmailBlock[]): EmailBlock[] {
  return blocks.filter((block) => {
    if (block.kind === 'facts') {
      block.rows = block.rows.filter((row) => row.value !== '—');
      return block.rows.length > 0;
    }
    if (block.kind === 'paragraph') return block.lines.some((line) => line !== '—');
    return block.items.length > 0;
  });
}

/** Plain-text alternative: the body as written, with the link restored at the end. */
export function toPlainText(body: string, url: string | null, ctaLabel?: string): string {
  const text = body.replace(/\r\n/g, '\n').trimEnd();
  if (!url || text.includes(url)) return text;
  return `${text}\n\n${ctaLabel ? `${ctaLabel}: ` : ''}${url}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
