import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ga4Service } from './ga4.service.js';

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'ga4.measurementId': 'G-TEST',
    'ga4.apiSecret': 'secret',
    'ga4.mock': false,
    'ga4.timeoutMs': 1_000,
    ...overrides,
  };
  return new Ga4Service({ get: (key: string) => values[key] } as unknown as ConfigService);
}

const input = { transactionId: 'pay-1', userId: 'u-1', valueMnt: 1_200_000, kind: 'PREPAYMENT', itemName: 'Урьдчилгаа' };

afterEach(() => vi.unstubAllGlobals());

describe('Ga4Service.trackPurchase', () => {
  it('posts a purchase keyed on the payment id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchMock);

    await makeService().trackPurchase(input);

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain('measurement_id=G-TEST');
    const body = JSON.parse(init.body);
    expect(body.user_id).toBe('u-1');
    expect(body.events[0]).toMatchObject({
      name: 'purchase',
      params: { transaction_id: 'pay-1', value: 1_200_000, currency: 'MNT' },
    });
  });

  it('sends nothing without a secret', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await makeService({ 'ga4.apiSecret': '' }).trackPurchase(input);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never throws when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(makeService().trackPurchase(input)).resolves.toBeUndefined();
  });
});
