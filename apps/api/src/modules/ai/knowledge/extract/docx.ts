import { cleanBlockText, toExtracted, type ExtractedDocument, type TextBlock } from './text-block.js';

/**
 * DOCX (2A-03) — the format the office actually has its handbooks in.
 *
 * mammoth converts to HTML rather than raw text on purpose: raw text throws the
 * heading structure away, and the heading path is what keeps a chunk under
 * "Дотуур байр" findable by "Ёнсэгийн дотуур байр" (§4.3). What comes back is a
 * small, predictable subset — `h1`–`h6`, `p`, `ul/ol/li`, `table/tr/td` — so it
 * is read with a block-level scanner instead of a DOM library.
 *
 * Word styles are mapped by mammoth's defaults: the built-in "Heading 1" style
 * becomes `h1`. A document whose author typed its titles in capitals instead of
 * styling them gets the narrow rescue in `inferHeadings` below — the staff guide
 * (2E-10) still asks for real heading styles, because a guess is a guess.
 */
export async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  const { convertToHtml } = await import('mammoth');
  const { value: html } = await convertToHtml({ buffer });

  return toExtracted(inferHeadings(htmlToBlocks(html)));
}

/**
 * The rescue path for a document with no heading styles at all.
 *
 * The office's own files are written this way — the real
 * `Бүрдүүлэх материалын жагсаалт` handbook comes out of mammoth as 55
 * paragraphs, its section titles typed in capitals rather than styled — and a
 * 55-block document with no heading path retrieves noticeably worse, since every
 * chunk then looks equally like every other.
 *
 * So: *only* when nothing in the document is a real heading, a short
 * all-capitals line is read as one. A numbered or roman-numeral section sits a
 * level below the bare title above it. The test is deliberately narrow — a
 * sentence of body text is neither short nor shouted — and it never overrides a
 * document whose author did use the styles. Exported for the tests.
 */
export function inferHeadings(blocks: TextBlock[]): TextBlock[] {
  if (blocks.some((block) => block.level !== null)) return blocks;

  return blocks.map((block) => {
    if (!looksLikeHeading(block.text)) return block;
    return { level: /^([IVXLC]+|\d+)\.\s/.test(block.text) ? 2 : 1, text: block.text };
  });
}

/** Short, shouted, and not a sentence. */
function looksLikeHeading(text: string): boolean {
  if (text.length > 80 || text.includes('\n')) return false;
  if (/[.,;:!?]$/.test(text.replace(/\.$/, ''))) return false;

  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;

  return letters === letters.toUpperCase();
}

/** Block-level tags, in the order they appear. Exported for the tests. */
export function htmlToBlocks(html: string): TextBlock[] {
  const blocks: TextBlock[] = [];

  // Tables first, whole: a row split off from its header loses which column a
  // figure was in, which is the one thing a table is for.
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    blocks.push({ level: null, text: tableToText(table) });
    return ` TABLE${blocks.length - 1} `;
  });

  const pattern = /<(h[1-6]|p|li)[^>]*>([\s\S]*?)<\/\1>| TABLE(\d+) /gi;
  const ordered: TextBlock[] = [];

  for (const match of withTables.matchAll(pattern)) {
    const [, tag, inner, tableIndex] = match;

    if (tableIndex !== undefined) {
      ordered.push(blocks[Number(tableIndex)]!);
      continue;
    }

    const text = cleanBlockText(stripTags(inner ?? ''));
    if (!text) continue;

    const heading = /^h([1-6])$/i.exec(tag ?? '');
    ordered.push({
      level: heading ? (Math.min(Number(heading[1]), 3) as 1 | 2 | 3) : null,
      text,
    });
  }

  return ordered;
}

/** One row per line, cells tab-separated — the shape a model reads as a table. */
function tableToText(table: string): string {
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...(row[1] ?? '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => cleanBlockText(stripTags(cell[1] ?? '')))
      .join('\t'),
  );

  return rows.filter(Boolean).join('\n');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}
