import { describe, expect, it } from 'vitest';
import { chunkBlocks, estimateTokens } from './chunker.js';
import { extractMarkdown } from './extract/markdown.js';
import type { TextBlock } from './extract/text-block.js';

/** A paragraph of roughly `tokens` estimated tokens of Mongolian text. */
function paragraph(tokens: number, marker = 'а'): TextBlock {
  const word = `материал${marker}`;
  const perWord = estimateTokens(`${word} `);
  return { level: null, text: Array.from({ length: Math.ceil(tokens / perWord) }, () => word).join(' ') };
}

describe('estimateTokens', () => {
  it('counts Cyrillic as dense — measured at ~2.25 chars per token', () => {
    const text = 'Тэтгэлгийн материал бүрдүүлэх нь орчуулга, нотариат, шуудангаар илгээх гэсэн гурван ажил.';

    // Gemini's countTokens returns 86 for the 194-character sample this ratio
    // was measured on; the estimate has to land in the same neighbourhood.
    expect(estimateTokens(text)).toBeGreaterThan(text.length / 2.6);
    expect(estimateTokens(text)).toBeLessThan(text.length / 1.9);
  });

  it('counts Latin text as roughly four characters per token', () => {
    const text = 'Preparing scholarship documents involves translation and notarisation.';

    // Gemini counted 25 for this 149-character sentence; a cheap estimator is
    // allowed to be conservative, never to undercount by much.
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(text.length / 6);
    expect(estimateTokens(text)).toBeLessThanOrEqual(text.length / 3.5);
  });

  it('never returns zero for a non-empty string', () => {
    expect(estimateTokens('а')).toBe(1);
  });
});

describe('chunkBlocks', () => {
  it('carries the H1 > H2 > H3 path onto every chunk', () => {
    const { blocks } = extractMarkdown(
      ['# Виз', '## D-4', '### Санхүүгийн баримт', '', 'Банкны хуулга шаардагдана.'].join('\n'),
    );

    const [chunk] = chunkBlocks(blocks);
    expect(chunk!.heading).toBe('Виз > D-4 > Санхүүгийн баримт');
    expect(chunk!.content).toContain('Банкны хуулга');
  });

  it('drops a deeper path segment when a shallower heading follows', () => {
    const { blocks } = extractMarkdown(
      ['# Виз', '## D-4', '', paragraph(300).text, '', '## D-2', '', paragraph(300).text].join('\n'),
    );

    const headings = chunkBlocks(blocks).map((chunk) => chunk.heading);
    expect(headings).toContain('Виз > D-4');
    expect(headings).toContain('Виз > D-2');
    expect(headings.some((heading) => heading?.includes('D-4 > D-2'))).toBe(false);
  });

  it('keeps chunks inside the target band', () => {
    const chunks = chunkBlocks(Array.from({ length: 12 }, (_, i) => paragraph(120, String(i))));

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(500);
    }
  });

  it('overlaps neighbours so a boundary sentence is in both', () => {
    const chunks = chunkBlocks(Array.from({ length: 8 }, (_, i) => paragraph(100, String(i))));

    expect(chunks.length).toBeGreaterThan(1);
    // The tail words of one chunk open the next: no block here is small enough
    // to carry whole, which is the case a block-only overlap would have missed.
    const tailWords = chunks[0]!.content.trim().split(/\s+/).slice(-5).join(' ');
    expect(chunks[1]!.content.startsWith(tailWords)).toBe(true);
  });

  it('breaks at a section boundary rather than mid-section', () => {
    const { blocks } = extractMarkdown(
      ['# Материал', '', paragraph(380).text, '', '# Виз', '', paragraph(380).text].join('\n'),
    );

    const chunks = chunkBlocks(blocks);
    // No chunk may mix the two sections: the heading of the second one is the
    // best split point the document offers.
    expect(chunks.every((chunk) => chunk.heading === 'Материал' || chunk.heading === 'Виз')).toBe(true);
  });

  it('merges subsections too short to stand alone', () => {
    const { blocks } = extractMarkdown(
      ['# Материал', '## Нэг', 'Хоёр үг.', '## Хоёр', 'Гурван үг.', '## Гурав', 'Дөрвөн үг.'].join('\n'),
    );

    expect(chunkBlocks(blocks)).toHaveLength(1);
  });

  it('never splits a table across chunks', () => {
    const table: TextBlock = {
      level: null,
      text: ['Сургууль\tХугацаа', 'Ёнсэ\t3 сар', 'Корё\t9 сар'].join('\n'),
    };
    const chunks = chunkBlocks([paragraph(380, 'б'), table, paragraph(380, 'в')]);

    const withTable = chunks.filter((chunk) => chunk.content.includes('Ёнсэ'));
    expect(withTable).toHaveLength(1);
    expect(withTable[0]!.content).toContain('Корё');
  });

  it('splits a table that cannot fit, repeating its header row', () => {
    const rows = Array.from({ length: 120 }, (_, i) => `Сургууль ${i}\t${i} сар`);
    const table: TextBlock = { level: null, text: ['Сургууль\tХугацаа', ...rows].join('\n') };

    const chunks = chunkBlocks([table]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('Сургууль\tХугацаа')).toBe(true);
    }
  });

  it('splits an oversized paragraph on sentence ends', () => {
    const sentence = `${paragraph(60, 'г').text}.`;
    const chunks = chunkBlocks([{ level: null, text: Array.from({ length: 20 }, () => sentence).join(' ') }]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(500);
      expect(chunk.content.trimEnd().endsWith('.')).toBe(true);
    }
  });

  it('splits text with no punctuation at all rather than emitting one huge chunk', () => {
    const chunks = chunkBlocks([paragraph(2_000, 'д')]);

    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(500);
  });

  it('returns nothing for an empty document', () => {
    expect(chunkBlocks([])).toEqual([]);
  });

  it('keeps a heading-only document out of the index', () => {
    expect(chunkBlocks([{ level: 1, text: 'Зөвхөн гарчиг' }])).toEqual([]);
  });
});
