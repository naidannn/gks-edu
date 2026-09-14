/**
 * The common shape every extractor produces (2A-03).
 *
 * A document is a flat list of blocks, each either a heading at depth 1–3 or a
 * paragraph (`level: null`). Flat rather than a tree because that is what the
 * chunker wants: it walks the list keeping a running `H1 > H2 > H3` path, and a
 * tree would have to be flattened again to do it.
 */
export interface TextBlock {
  /** 1, 2 or 3 for a heading; null for body text. */
  level: 1 | 2 | 3 | null;
  text: string;
}

export interface ExtractedDocument {
  blocks: TextBlock[];
  /** The whole text, headings included — what the content hash is taken over. */
  text: string;
}

/**
 * Collapses whitespace inside one block without joining separate blocks.
 *
 * The exotic spaces are not pedantry: Word fills documents with non-breaking
 * and narrow spaces, and a soft hyphen is invisible on screen while splitting
 * a Mongolian word in two for anything that reads the bytes — the embedder and
 * the `tsv` index included.
 */
export function cleanBlockText(raw: string): string {
  return raw
    .replace(/\u00ad/g, '')
    .replace(/[\t\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
}

/** Renders blocks back to text — the hash input, and the debug view. */
export function blocksToText(blocks: TextBlock[]): string {
  return blocks
    .map((block) => (block.level ? `${'#'.repeat(block.level)} ${block.text}` : block.text))
    .join('\n\n');
}

export function toExtracted(blocks: TextBlock[]): ExtractedDocument {
  const kept = blocks.filter((block) => block.text.length > 0);
  return { blocks: kept, text: blocksToText(kept) };
}
