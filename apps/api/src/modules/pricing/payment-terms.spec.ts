import { describe, expect, it } from 'vitest';
import { DEFAULT_PAYMENT_DUE_DAYS, MAX_PAYMENT_DUE_DAYS, paymentDueAt } from './payment-terms.js';

describe('paymentDueAt', () => {
  it('lands `days` later, at the end of that day', () => {
    const due = paymentDueAt(new Date('2026-09-08T09:15:00.000Z'), 7);
    expect(due.toISOString()).toBe('2026-09-15T23:59:59.999Z');
  });

  it('gives the client the whole last day whatever time the invoice was raised', () => {
    // The regression this guards: computing from the raising *time* would make
    // an invoice raised at 09:00 fall due at 09:00, so the portal would call it
    // overdue while the office still counts that day as open. Every other
    // deadline in the system is stored at end of day UTC.
    const morning = paymentDueAt(new Date('2026-09-08T00:01:00.000Z'), 7);
    const evening = paymentDueAt(new Date('2026-09-08T23:58:00.000Z'), 7);
    expect(morning.toISOString()).toBe(evening.toISOString());
  });

  it('crosses a month boundary by the calendar, not by arithmetic on the day number', () => {
    expect(paymentDueAt(new Date('2026-09-28T10:00:00.000Z'), 7).toISOString()).toBe('2026-10-05T23:59:59.999Z');
  });

  it('keeps the office`s current window and its sanity ceiling in one place', () => {
    expect(DEFAULT_PAYMENT_DUE_DAYS).toBe(7);
    expect(MAX_PAYMENT_DUE_DAYS).toBeGreaterThan(DEFAULT_PAYMENT_DUE_DAYS);
  });
});
