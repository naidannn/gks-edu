import { describe, expect, it } from 'vitest';
import { CLIENT_CONTRACT_SELECT, toClientContract } from './client-contract.select.js';
import { CLIENT_PAYMENT_SELECT } from '../payments/client-payment.select.js';

describe('client-safe projections (1N-04)', () => {
  it('keeps the office`s audit trail out of the contract a client reads', () => {
    // `contract: true` used to ship all three into the portal payload.
    expect(CLIENT_CONTRACT_SELECT).not.toHaveProperty('physicalScanPath');
    expect(CLIENT_CONTRACT_SELECT).not.toHaveProperty('signedIp');
    expect(Object.keys(CLIENT_CONTRACT_SELECT)).toContain('bodyMn');
  });

  it('turns the archived PDF`s storage path into "there is one"', () => {
    const client = toClientContract({ id: 'contract-1', pdfPath: 'cases/case-1/CONTRACT_PDF/1-abc.pdf' });

    expect(client).toEqual({ id: 'contract-1', hasPdf: true });
    expect(toClientContract({ id: 'contract-1', pdfPath: null })).toEqual({ id: 'contract-1', hasPdf: false });
  });

  it('keeps the desk notes out of the payment a client reads', () => {
    for (const staffField of ['note', 'receiptPath', 'createdById', 'qpayPaymentId']) {
      expect(CLIENT_PAYMENT_SELECT).not.toHaveProperty(staffField);
    }
    // The date they are chased on is theirs to see.
    expect(CLIENT_PAYMENT_SELECT).toHaveProperty('dueAt');
  });
});
