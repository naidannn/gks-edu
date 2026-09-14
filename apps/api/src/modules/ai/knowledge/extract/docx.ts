import { htmlToBlocks } from './html.js';
import { toExtracted, type ExtractedDocument, type TextBlock } from './text-block.js';

export { htmlToBlocks };

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
