import { cleanBlockText, type TextBlock } from './text-block.js';

/**
 * Simple HTML → blocks.
 *
 * Two callers, one scanner: mammoth's DOCX conversion (2A-03) and the rich-text
 * body of a published article (2A-07). Both produce a small, predictable subset
 * — `h1`–`h6`, `p`, `ul/ol/li`, `table/tr/td` — so this reads block-level tags
 * with a regex rather than pulling in a DOM library for the purpose.
 *
 * Blocks come back in document order. A table is kept whole and in place — a row
 * separated from its header is a line of numbers nobody can read.
 */
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
