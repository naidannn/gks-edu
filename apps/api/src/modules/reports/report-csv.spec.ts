import { describe, expect, it } from 'vitest';
import { receivablesCsv, toCsv } from './report-csv.js';
import type { FinanceReport } from './report-types.js';

/**
 * The CSV is the one report artefact that leaves the system, so the two things
 * that would silently corrupt it in this office are checked here: a field that
 * contains a comma, and the byte order mark without which Excel on Windows
 * renders every Mongolian name as mojibake.
 */

describe('toCsv', () => {
  it('leads with a UTF-8 BOM so Excel reads Cyrillic', () => {
    expect(toCsv(['Нэр'], [['Бат']]).startsWith('﻿')).toBe(true);
  });

  it('quotes only what needs it', () => {
    const csv = toCsv(['a', 'b'], [['plain', 'has,comma']]);
    expect(csv).toContain('plain,"has,comma"');
  });

  it('escapes a quote by doubling it, and survives a newline in a note', () => {
    const csv = toCsv(['note'], [['he said "no"'], ['line\nbreak']]);
    expect(csv).toContain('"he said ""no"""');
    expect(csv).toContain('"line\nbreak"');
  });

  it('writes an absent value as an empty field rather than "null"', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toContain('\r\n,\r\n');
  });

  it('ends every row with CRLF, which is what Excel expects', () => {
    expect(toCsv(['a'], [['1']])).toBe('﻿a\r\n1\r\n');
  });
});

describe('receivablesCsv', () => {
  const report = {
    period: { generatedAt: '2026-09-09T14:20:00.000Z', from: '2026-09-01', to: '2026-10-01' },
    receivables: {
      top: [
        {
          paymentId: 'p1',
          caseId: 'c1',
          caseCode: 'GKS-2026-0001',
          clientName: 'Бат, Дорж',
          consultantName: null,
          serviceType: 'GKS_SCHOLARSHIP',
          kind: 'BALANCE',
          amountMnt: 3_500_000,
          dueAt: '2026-08-20T00:00:00.000Z',
          daysOverdue: 20,
        },
      ],
    },
  } as unknown as FinanceReport;

  it('names the file by the day it was taken, so two exports never collide silently', () => {
    expect(receivablesCsv(report).filename).toBe('avlaga-2026-09-09.csv');
  });

  it('labels the row in Mongolian and keeps a comma inside one field', () => {
    const { content } = receivablesCsv(report);
    expect(content).toContain('"Бат, Дорж"');
    expect(content).toContain('Үлдэгдэл төлбөр');
    expect(content).toContain('GKS тэтгэлэг');
    // 20 days late falls in the 8–30 bucket.
    expect(content).toContain('8–30 хоног хэтэрсэн');
  });

  it('writes a due date as a day, not a timestamp', () => {
    expect(receivablesCsv(report).content).toContain('2026-08-20');
  });
});
