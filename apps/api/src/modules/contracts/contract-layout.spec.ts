import { describe, expect, it } from 'vitest';
import { CONTRACT_BODY_TEMPLATE } from './contract-body.template.js';
import { ContractPdfService, strandsHeading } from './contract-pdf.service.js';

/** A4 minus the contract's own margins — the text column runs 75 → 776.89. */
const TOP = 75;
const BOTTOM = 841.89 - 65;
const HEADING = 14;
/** The signature table is about this tall once both columns are filled. */
const PARTIES = 200;

/**
 * pdfkit writes each page's `/Resources` dictionary uncompressed, right after
 * the page object, so the pages carrying an image can be counted without a PDF
 * parser. The letterhead is the only image the contract draws.
 */
function pagesWithLetterhead(pdf: Buffer): number {
  const raw = pdf.toString('latin1');
  return raw
    .split(/\/Type\s*\/Page[^s]/)
    .slice(1)
    .filter((page) => page.slice(0, 400).includes('/XObject')).length;
}

function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

describe('where the contract breaks its pages', () => {
  it('moves a heading that would be cut off from what follows it', () => {
    expect(strandsHeading(BOTTOM - 100, HEADING, PARTIES)).toBe(true);
  });

  it('leaves a heading alone when the block under it still fits', () => {
    expect(strandsHeading(TOP + 200, HEADING, PARTIES)).toBe(false);
  });

  // Otherwise a heading that opens a page would push itself onto the next one,
  // and the one after that, emitting blank sheets on the way.
  it('never breaks a heading that is already at the top of its page', () => {
    expect(strandsHeading(TOP, HEADING, 10_000)).toBe(false);
  });
});

describe('the printed contract', () => {
  it('prints the letterhead on the opening sheet only', async () => {
    const body = CONTRACT_BODY_TEMPLATE.replace(/\{\{(\w+)\}\}/g, (_, token: string) => `[${token}]`);
    const pdf = await new ContractPdfService().render({
      title: 'СУРГАЛТ ЗУУЧЛАЛЫН ГЭРЭЭ',
      number: 'СГ/26/005',
      contractDate: new Date('2026-09-06'),
      bodyMn: body,
    });

    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(pagesWithLetterhead(pdf)).toBe(1);
  });
});
