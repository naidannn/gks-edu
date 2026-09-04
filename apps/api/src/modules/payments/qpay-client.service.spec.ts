import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { QpayClientService } from './qpay-client.service.js';

function configStub(mock: boolean) {
  return { get: () => mock, getOrThrow: () => '' } as unknown as ConfigService;
}

describe('QpayClientService (QPAY_MOCK=true — no sandbox account exists yet, 1C-20)', () => {
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
