import type { PreparedChunk } from './knowledge.service.js';
import type { TextBlock } from './extract/text-block.js';

/**
 * Token estimate for mixed Mongolian / Korean / Latin text.
 *
 * Measured against Gemini's `countTokens` rather than guessed, because the usual
 * "four characters per token" rule is wrong here by more than a factor of two:
 *
 *   | text                    | chars/token |
 *   |-------------------------|-------------|
 *   | Mongolian Cyrillic prose| 2.26        |
 *   | Mongolian list items    | 2.25        |
 *   | Cyrillic + TOPIK/D-2    | 2.16        |
 *   | English prose           | 5.96        |
 *
 * So a 400-token chunk of Mongolian is about 900 characters, not 1,600. Sizing
 * chunks on the Latin ratio would have made every one of them two and a half
 * times too long, which costs context on every single turn.
 *
 * Hangul is counted with Cyrillic: it is dense for the same reason, and a Korean
 * school name is the commonest non-Cyrillic run in this corpus.
 */
export function estimateTokens(text: string): number {
  const dense = (text.match(/[\p{Script=Cyrillic}\p{Script=Hangul}\p{Script=Han}]/gu) ?? []).length;
  const rest = text.length - dense;

  return Math.max(1, Math.ceil(dense / 2.25 + rest / 4));
}

export interface ChunkOptions {
  /** Where a chunk is closed off. */
  targetTokens?: number;
  /** Hard ceiling — a single block longer than this is split internally. */
  maxTokens?: number;
  /** Below this a chunk is merged forward instead of standing alone. */
  minTokens?: number;
  /** Share of a chunk's tail repeated at the head of the next one. */
  overlapRatio?: number;
}

const DEFAULTS = {
  targetTokens: 400,
  maxTokens: 500,
  minTokens: 120,
  overlapRatio: 0.15,
} satisfies Required<ChunkOptions>;

/**
 * Blocks → chunks (2A-04).
 *
 * Four rules, each of them a retrieval bug avoided rather than a preference:
 *
 * 1. **The heading path travels with the text.** Every chunk carries its
 *    `H1 > H2 > H3` trail, which is embedded with the body (§4.3). Without it a
 *    chunk that says "Байр нь хагас жилийн төлбөртэй" cannot be matched to the
 *    school it was written under.
 * 2. **A heading closes the previous chunk** once that chunk is big enough to
 *    stand on its own. A section boundary is the best split point a document
 *    offers; splitting mid-section is what puts half an answer in one chunk and
 *    half in another.
 * 3. **Chunks overlap by ~15%.** The sentence that answers a question is often
 *    the one that straddles a boundary, and a tail repeated into the next chunk
 *    means both neighbours can answer it.
 * 4. **A table is never split across chunks** unless it cannot fit at all, and
 *    then each part repeats the header row. A row without its header is a line
 *    of numbers nobody can read.
 */
export function chunkBlocks(blocks: TextBlock[], options: ChunkOptions = {}): PreparedChunk[] {
  const { targetTokens, maxTokens, minTokens, overlapRatio } = { ...DEFAULTS, ...options };

  const chunks: PreparedChunk[] = [];
  const path: (string | null)[] = [null, null, null];

  // A chunk that starts with carried overlap has less room for new material, so
  // an oversized block is split to leave exactly that much headroom. Without it
  // `maxTokens` is quietly exceeded by the size of the overlap on every chunk
  // that follows a split.
  const overlapBudget = Math.floor(targetTokens * overlapRatio);
  const blockCeiling = Math.max(minTokens, maxTokens - overlapBudget);

  /** Blocks accumulated for the chunk being built, with its heading path. */
  let pending: PendingBlock[] = [];
  let pendingHeading: string | null = null;

  const pendingTokens = () => pending.reduce((total, block) => total + block.tokens, 0);

  const headingPath = () => {
    const parts = path.filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join(' > ') : null;
  };

  /**
   * Closes the current chunk. `carryOverlap` is false at a section boundary:
   * the overlap exists to keep a sentence that straddles an *arbitrary* split,
   * and a heading is not arbitrary — carrying the old section's tail forward
   * would file it under the new section's heading.
   */
  const flush = (carryOverlap = true): void => {
    if (pending.length === 0) return;

    chunks.push({
      heading: pendingHeading,
      content: pending.map((block) => block.text).join('\n\n'),
      tokenCount: pendingTokens(),
    });

    pending = carryOverlap ? overlapTail(pending, overlapBudget) : [];
    pendingHeading = headingPath();
  };

  for (const block of blocks) {
    if (block.level !== null) {
      // Rule 2: close the previous chunk at a section boundary, but only if it
      // can stand alone. A run of short subsections merges into one chunk
      // instead of becoming a dozen two-line ones.
      if (pendingTokens() >= minTokens) flush(false);

      path[block.level - 1] = block.text;
      for (let deeper = block.level; deeper < path.length; deeper += 1) path[deeper] = null;

      // The heading that follows a short section labels the merged chunk with
      // the deepest path it spans, which is the one a reader would give it.
      pendingHeading = headingPath();
      continue;
    }

    const isTable = block.text.includes('\n');
    const parts = splitOversized(block.text, blockCeiling, isTable);

    for (const part of parts) {
      const tokens = estimateTokens(part);

      // Rule 4: a table that fits but would overflow this chunk starts the next
      // one whole, rather than being cut at the boundary.
      if (pending.length > 0 && pendingTokens() + tokens > maxTokens) flush();
      if (pending.length === 0) pendingHeading = headingPath();

      pending.push({ text: part, tokens, isTable });

      if (pendingTokens() >= targetTokens) flush();
    }
  }

  // Whatever is left: merged into the previous chunk when it is too small to be
  // worth its own row, since a 20-token chunk matches almost any query weakly
  // and crowds out a real one. Pending that is *only* carried-over overlap is
  // dropped — it has already been stored as the tail of the chunk before it.
  if (pending.some((block) => !block.carried)) {
    const leftover = pending.map((block) => block.text).join('\n\n');
    const last = chunks.at(-1);

    if (last && pendingTokens() < minTokens) {
      last.content = `${last.content}\n\n${pending.filter((block) => !block.carried).map((block) => block.text).join('\n\n')}`;
      last.tokenCount = estimateTokens(last.content);
    } else {
      chunks.push({ heading: pendingHeading, content: leftover, tokenCount: pendingTokens() });
    }
  }

  return chunks;
}

interface PendingBlock {
  text: string;
  tokens: number;
  isTable: boolean;
  /** True when this text is the previous chunk's overlap rather than new material. */
  carried?: boolean;
}

/**
 * The tail of a chunk, repeated at the head of the next one (rule 3).
 *
 * Whole blocks first; but a document of 100-token paragraphs has no block small
 * enough to fit a 60-token budget, and a block-only overlap would then silently
 * never happen. So the fallback is the trailing *sentences* of the last
 * paragraph, and trailing words when a "sentence" is a whole unpunctuated block.
 *
 * Tables are never carried: repeating one is noise, and its whole value is being
 * in exactly one place.
 */
function overlapTail(pending: PendingBlock[], budget: number): PendingBlock[] {
  if (budget <= 0) return [];

  const carry: PendingBlock[] = [];
  let carried = 0;

  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const block = pending[index]!;
    if (block.isTable || carried + block.tokens > budget) break;
    carry.unshift({ ...block, carried: true });
    carried += block.tokens;
  }

  if (carry.length > 0) return carry;

  const last = [...pending].reverse().find((block) => !block.isTable);
  if (!last) return [];

  const tail = tailText(last.text, budget);
  return tail ? [{ text: tail, tokens: estimateTokens(tail), isTable: false, carried: true }] : [];
}

/** The last `budget` tokens' worth of a paragraph, cut at a sentence if it can be. */
function tailText(text: string, budget: number): string | null {
  const sentences = text.match(/[^.!?…]+[.!?…]+\s*|[^.!?…]+$/g) ?? [];
  if (sentences.length > 1) {
    const tail: string[] = [];
    let tokens = 0;

    for (let index = sentences.length - 1; index >= 0; index -= 1) {
      const sentence = sentences[index]!;
      const cost = estimateTokens(sentence);
      if (tokens + cost > budget) break;
      tail.unshift(sentence);
      tokens += cost;
    }

    if (tail.length > 0) return tail.join('').trim();
  }

  const words = text.split(/\s+/);
  const tail: string[] = [];
  let tokens = 0;

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const cost = estimateTokens(`${words[index]!} `);
    if (tokens + cost > budget) break;
    tail.unshift(words[index]!);
    tokens += cost;
  }

  return tail.length > 0 ? tail.join(' ') : null;
}

/**
 * Splits one block that is longer than a whole chunk.
 *
 * A table splits by rows with its header row repeated on each part; prose splits
 * on sentence ends, and only on a bare character count if a single "sentence" is
 * still too long — a wall of text with no punctuation, which does happen in a
 * badly converted PDF.
 */
function splitOversized(text: string, maxTokens: number, isTable: boolean): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];

  if (isTable) {
    const [header, ...rows] = text.split('\n');
    const parts: string[] = [];
    let current: string[] = [];

    for (const row of rows) {
      current.push(row);
      if (estimateTokens([header, ...current].join('\n')) >= maxTokens) {
        parts.push([header, ...current].join('\n'));
        current = [];
      }
    }
    if (current.length > 0) parts.push([header, ...current].join('\n'));
    return parts.length > 0 ? parts : [text];
  }

  const sentences = text.match(/[^.!?…]+[.!?…]+[\s]*|[^.!?…]+$/g) ?? [text];
  const parts: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (current && estimateTokens(candidate) > maxTokens) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.flatMap((part) => (estimateTokens(part) > maxTokens ? hardSplit(part, maxTokens) : [part]));
}

/** The last resort: a fixed character window sized from the measured ratio. */
function hardSplit(text: string, maxTokens: number): string[] {
  const perChunk = Math.max(200, Math.floor((maxTokens * text.length) / estimateTokens(text)));
  const parts: string[] = [];

  for (let start = 0; start < text.length; start += perChunk) {
    parts.push(text.slice(start, start + perChunk).trim());
  }

  return parts.filter(Boolean);
}
