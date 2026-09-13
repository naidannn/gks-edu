import { cleanBlockText, toExtracted, type ExtractedDocument, type TextBlock } from './text-block.js';

/**
 * Markdown and plain text (2A-03).
 *
 * Markdown is the format the office should be writing in, so this extractor is
 * the one that keeps the most structure: `#`/`##`/`###` become heading levels,
 * and a list or a table stays one block so the chunker never splits a row off
 * from its header (§4.3).
 *
 * A `.txt` file goes through the same path: it simply has no heading markers, so
 * every block is a paragraph. That is a real loss of structure rather than a
 * failure — the admin guide (2E-10) asks for Markdown for this reason.
 */
export function extractMarkdown(raw: string): ExtractedDocument {
  const blocks: TextBlock[] = [];
  let paragraph: string[] = [];
  let table: string[] = [];
  let fence: string | null = null;
  let code: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ level: null, text: cleanBlockText(paragraph.join(' ')) });
      paragraph = [];
    }
  };

  const flushTable = () => {
    if (table.length > 0) {
      // Kept verbatim, newlines and pipes and all: a table read as prose loses
      // which column a number was in.
      blocks.push({ level: null, text: table.join('\n').trim() });
      table = [];
    }
  };

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();

    // A fenced block is copied through untouched — indentation is its meaning.
    if (fence !== null) {
      if (trimmed.startsWith(fence)) {
        blocks.push({ level: null, text: code.join('\n').trim() });
        code = [];
        fence = null;
      } else {
        code.push(line);
      }
      continue;
    }

    const fenceStart = /^(```|~~~)/.exec(trimmed);
    if (fenceStart) {
      flushParagraph();
      flushTable();
      fence = fenceStart[1]!;
      continue;
    }

    if (trimmed.startsWith('|')) {
      flushParagraph();
      table.push(trimmed);
      continue;
    }
    flushTable();

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      // Deeper than H3 is rare and carries little navigational meaning; it
      // folds into H3 rather than growing the path.
      const depth = Math.min(heading[1]!.length, 3) as 1 | 2 | 3;
      blocks.push({ level: depth, text: cleanBlockText(heading[2]!) });
      continue;
    }

    // An underlined heading: `Гарчиг` over `=====` or `-----`.
    const underline = /^(=+|-{2,})$/.exec(trimmed);
    if (underline && paragraph.length === 1) {
      blocks.push({ level: trimmed.startsWith('=') ? 1 : 2, text: cleanBlockText(paragraph[0]!) });
      paragraph = [];
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    // A list item is its own block: items are independent facts, and gluing
    // them into one paragraph is how "12 documents" becomes one sentence.
    if (/^([-*+]|\d+[.)])\s+/.test(trimmed)) {
      flushParagraph();
      blocks.push({ level: null, text: cleanBlockText(trimmed.replace(/^([-*+]|\d+[.)])\s+/, '')) });
      continue;
    }

    paragraph.push(trimmed);
  }

  if (fence !== null && code.length > 0) blocks.push({ level: null, text: code.join('\n').trim() });
  flushParagraph();
  flushTable();

  return toExtracted(blocks);
}
