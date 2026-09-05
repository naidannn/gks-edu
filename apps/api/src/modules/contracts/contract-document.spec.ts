import { describe, expect, it } from 'vitest';
import { CONTRACT_BODY_TEMPLATE } from './contract-body.template.js';
import { parseContractBody } from './contract-document.js';

describe('parseContractBody', () => {
  it('reads headings, paragraphs and the party table', () => {
    const blocks = parseContractBody(
      [
        'Оршил хэсэг.',
        '',
        '## НЭГ. НИЙТЛЭГ ҮНДЭСЛЭЛ',
        '',
        '1.1 Эхний заалт',
        'үргэлжлэл.',
        '',
        '[[parties]]',
        '',
        'ЗУУЧЛАГЧ:',
        '',
        'Гарын үсэг: ____',
        '[[|]]',
        'ЗУУЧЛУУЛАГЧ:',
        'Огноо: 2026/09/05',
        '',
        '[[/parties]]',
      ].join('\n'),
    );

    expect(blocks).toEqual([
      { kind: 'paragraph', lines: ['Оршил хэсэг.'] },
      { kind: 'heading', text: 'НЭГ. НИЙТЛЭГ ҮНДЭСЛЭЛ' },
      { kind: 'paragraph', lines: ['1.1 Эхний заалт', 'үргэлжлэл.'] },
      { kind: 'parties', columns: [['ЗУУЧЛАГЧ:', '', 'Гарын үсэг: ____'], ['ЗУУЧЛУУЛАГЧ:', 'Огноо: 2026/09/05']] },
    ]);
  });

  it('parses the shipped template into ten sections and one party table', () => {
    const blocks = parseContractBody(CONTRACT_BODY_TEMPLATE);
    expect(blocks.filter((b) => b.kind === 'heading')).toHaveLength(10);
    expect(blocks.filter((b) => b.kind === 'parties')).toHaveLength(1);
    // Nothing is lost: the last block is the signature table.
    expect(blocks.at(-1)?.kind).toBe('parties');
  });

  it('leaves ordinary text untouched when it carries no markers', () => {
    expect(parseContractBody('Ганц мөр.')).toEqual([{ kind: 'paragraph', lines: ['Ганц мөр.'] }]);
  });
});
