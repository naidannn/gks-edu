/**
 * The assistant's answers, as a visitor reads them.
 *
 * The model writes light Markdown — `**bold**`, `* ` bullets, numbered steps,
 * the odd `###` — and cites its sources inline as `[K1]`/`[T2]`. Shown raw, a
 * list of five deadlines is a wall of asterisks with codes in it. This turns
 * that into a handful of HTML elements and drops the markers; which sources an
 * answer used is still one tap away in the list under it (`AiChatSources`).
 *
 * Deliberately small rather than a Markdown library: the input is a chat
 * answer, not a document, and every construct here is one the prompt produces.
 * Everything is HTML-escaped first, so the only tags in the output are the ones
 * this file writes — the result is safe for `v-html`.
 */

/** "120 сая₮ [T1]." → "120 сая₮." — the same rule the Messenger channel uses. */
const CITATION = /\s*\[(?:[A-Z]{1,2}\d+)(?:\s*,\s*[A-Z]{1,2}\d+)*\]/g;

export function stripCitations(text: string): string {
  return text.replace(CITATION, '');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Links only to our own pages or to the web — never `javascript:` or the like. */
function safeHref(href: string): string | null {
  return /^(https?:\/\/|\/(?!\/))/.test(href) ? href : null;
}

/** Bold, italics, code and links inside one line of already-escaped text. */
function inline(text: string): string {
  return (
    text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) => {
        const target = safeHref(href.replace(/&amp;/g, '&'));
        if (!target) return label;
        const external = target.startsWith('http');
        return `<a href="${escapeHtml(target)}"${external ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`;
      })
      .replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
      // A marker the stream has only half-delivered ("**Сөү") is noise until
      // its closing half arrives.
      .replace(/\*\*(?=[^*]*$)/, '')
  );
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;

interface ListState {
  tag: 'ul' | 'ol';
  items: string[];
  start: number;
}

/** Markdown-ish answer text → safe HTML, citation markers removed. */
export function renderChatMarkdown(source: string): string {
  const lines = escapeHtml(stripCitations(source).replace(/\r\n?/g, '\n')).split('\n');
  const out: string[] = [];
  let paragraph: string[] = [];
  // Cast, not annotated: assigned inside the helpers below, which control-flow
  // narrowing cannot see, so an annotated `null` would stay `never` here.
  let list = null as ListState | null;

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const start = list.tag === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
    out.push(`<${list.tag}${start}>${list.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };

  for (const line of lines) {
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const heading = HEADING.exec(line);

    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [], start: numbered ? Number(numbered[1]) : 1 };
      }
      list!.items.push(bullet ? bullet[1]! : numbered![2]!);
    } else if (heading) {
      flushParagraph();
      flushList();
      out.push(`<p class="gks-md-heading"><strong>${inline(heading[1]!)}</strong></p>`);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (list && /^\s{2,}\S/.test(line)) {
      // An indented continuation of the item above.
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  flushList();
  return out.join('');
}
