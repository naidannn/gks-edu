import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { QpayClientService, expiryFromQpay } from './qpay-client.service.js';

function configStub(mock: boolean) {
  return { get: () => mock, getOrThrow: () => '' } as unknown as ConfigService;
}

describe('QpayClientService (QPAY_MOCK=true — the default outside production, 1C-20)', () => {
  it('createInvoice fakes a deterministic invoice without calling QPay', async () => {
    const client = new QpayClientService(configStub(true));
    const invoice = await client.createInvoice({
      invoiceNo: 'payment-1',
      amount: 200_000,
      description: 'test',
      callbackUrl: 'http://localhost/callback',
    });

    expect(invoice.invoiceId).toMatch(/^MOCK-/);
    expect(invoice.qrText).toContain(invoice.invoiceId);
    expect(invoice.qrImage).toBeNull();
  });

  it('checkPayment never reports paid — mock invoices are only confirmed via dev-mark-paid/webhook', async () => {
    const client = new QpayClientService(configStub(true));
    const result = await client.checkPayment('MOCK-anything');
    expect(result.paid).toBe(false);
  });
});

describe('expiryFromQpay', () => {
  const now = Date.UTC(2026, 8, 9, 9, 0, 0);

  it('reads QPay production\'s absolute timestamp as the expiry it is', () => {
    // What merchant.qpay.mn actually answers: a Unix timestamp 24h out.
    const tomorrow = Math.floor(now / 1000) + 86_400;
    expect(expiryFromQpay(tomorrow, now)).toBe(tomorrow * 1000 - 30_000);
  });

  it('still treats a small value as the duration the field claims to be', () => {
    expect(expiryFromQpay(3600, now)).toBe(now + 3_600_000 - 30_000);
  });

  it('falls back to an hour when QPay omits the field', () => {
    expect(expiryFromQpay(undefined, now)).toBe(now + 3_600_000 - 30_000);
  });
});
