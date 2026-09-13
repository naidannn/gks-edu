import { cleanBlockText, toExtracted, type ExtractedDocument, type TextBlock } from './text-block.js';

/**
 * PDF (2A-03) — `unpdf`, which is pdf.js's text layer with no native build.
 *
 * `pdf-parse` was the plan, and its current release pulls `@napi-rs/canvas`: a
 * ~40MB platform-specific binary, needed only for *rendering*, on a server that
 * installs its production dependencies in place (see `deploy/`). Text extraction
 * does not need a canvas, so this takes the dependency-free route to the same
 * text.
 *
 * A PDF carries no heading information — only glyphs at positions — so every
 * block here is a paragraph and the chunker gets no heading path. That is the
 * honest outcome, and it is why the staff guide (2E-10) asks for DOCX or
 * Markdown whenever there is a choice: a 40-page PDF handbook retrieves
 * noticeably worse than the same text with its headings intact.
 */
export async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });

  return toExtracted(pdfTextToBlocks(Array.isArray(text) ? text.join('\n') : text));
}

/**
 * Paragraphs out of a PDF's text layer. Exported for the tests.
 *
 * Two joins do the work. A line ending mid-sentence is glued to the next one,
 * because pdf.js breaks at the *visual* line and a chunk full of 60-character
 * fragments embeds badly. A hyphen at a line end is a word split across lines —
 * Mongolian text hyphenates — so the halves are rejoined without the hyphen.
 */
export function pdfTextToBlocks(raw: string): TextBlock[] {
  const blocks: TextBlock[] = [];
  let lines: string[] = [];

  const flush = () => {
    if (lines.length === 0) return;
    const joined = lines
      .reduce<string>((text, line) => {
        if (text.endsWith('-')) return `${text.slice(0, -1)}${line}`;
        return text ? `${text} ${line}` : line;
      }, '')
      .trim();
    const cleaned = cleanBlockText(joined);
    if (cleaned) blocks.push({ level: null, text: cleaned });
    lines = [];
  };

  for (const line of raw.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();

    if (trimmed.length === 0) {
      flush();
      continue;
    }

    // A page number or a running footer on its own line: dropped rather than
    // embedded, since "13" is never the answer to anything.
    if (/^\d{1,3}$/.test(trimmed)) continue;

    lines.push(trimmed);

    // A line that ends a sentence ends the paragraph — otherwise a whole page
    // arrives as one block and the chunker has nothing to split on.
    if (/[.!?:;…]$/.test(trimmed)) flush();
  }

  flush();
  return blocks;
}
