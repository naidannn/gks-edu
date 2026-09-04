import { describe, expect, it } from 'vitest';
import { extractKrwRate } from './fx.service.js';

/**
 * 1E-07 — the rate feed's shape is not a published contract, so the parser
 * accepts the shapes seen in the wild and refuses anything it cannot read
 * rather than writing a wrong rate into an invoice.
 */
describe('extractKrwRate', () => {
  it('reads a row object keyed by currency code', () => {
    expect(extractKrwRate([{ code: 'KRW', name: 'БНСУ-ын вон', rate: '2.65', rate_float: 2.65 }])).toBe(2.65);
  });

  it('reads a flat currency map', () => {
    expect(extractKrwRate({ rates: { USD: '3450.00', KRW: '2.61' } })).toBe(2.61);
  });

  it('normalises a per-1,000-won quote down to per won', () => {
    expect(extractKrwRate({ code: 'KRW', rate: 2650 })).toBe(2.65);
  });

  it('returns null rather than guessing', () => {
    expect(extractKrwRate({ rates: { USD: '3450.00' } })).toBeNull();
    expect(extractKrwRate('<!DOCTYPE html>')).toBeNull();
    expect(extractKrwRate({ code: 'KRW', rate: 0 })).toBeNull();
  });
});
