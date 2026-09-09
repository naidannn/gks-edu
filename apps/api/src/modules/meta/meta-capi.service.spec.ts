import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MetaCapiService, MetaPermanentError } from './meta-capi.service.js';
import type { MetaServerEvent } from './meta-capi.types.js';

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'meta.pixelId': '1858714955098486',
    'meta.accessToken': 'system-user-token',
    'meta.graphVersion': 'v26.0',
    'meta.testEventCode': '',
    'meta.timeoutMs': 10_000,
    'meta.mock': false,
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new MetaCapiService(config);
}

const event: MetaServerEvent = {
  event_name: 'Lead',
  event_time: 1_700_000_000,
  event_id: 'evt-1',
  action_source: 'website',
  event_source_url: 'https://gksedu.mn/consultation',
  user_data: { em: ['abc'] },
};

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('MetaCapiService', () => {
  it('is disabled — and so logs instead of posting — until both the dataset and the token are set', async () => {
    const fetchMock = respondWith({});

    expect(makeService({ 'meta.accessToken': '' }).enabled).toBe(false);
    expect(makeService({ 'meta.pixelId': '' }).enabled).toBe(false);
    // The switch works even with a real token present — staging must not write
    // into the live dataset.
    expect(makeService({ 'meta.mock': true }).enabled).toBe(false);

    await makeService({ 'meta.accessToken': '' }).send([event]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the dataset, with the token in the body rather than the URL', async () => {
    const fetchMock = respondWith({ events_received: 1, messages: [] });

    const result = await makeService().send([event]);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v26.0/1858714955098486/events');
    expect(url).not.toContain('system-user-token');
    const body = JSON.parse((init as { body: string }).body);
    expect(body.access_token).toBe('system-user-token');
    expect(body.data).toEqual([event]);
    expect(body.test_event_code).toBeUndefined();
    expect(result.eventsReceived).toBe(1);
  });

  it('adds the test-event code only when one is configured', async () => {
    const fetchMock = respondWith({ events_received: 1 });

    await makeService({ 'meta.testEventCode': 'TEST12345' }).send([event]);

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.test_event_code).toBe('TEST12345');
  });

  it('throws a retryable error when Meta is having a bad day', async () => {
    respondWith({ error: { message: 'Please retry' } }, 500);
    await expect(makeService().send([event])).rejects.not.toBeInstanceOf(MetaPermanentError);
  });

  it('treats a rejected event as permanent, so the queue does not chew on it', async () => {
    respondWith({ error: { message: 'Invalid parameter', code: 100 } }, 400);
    await expect(makeService().send([event])).rejects.toBeInstanceOf(MetaPermanentError);
  });

  it('retries a rate-limit, which is a 4xx that does clear on its own', async () => {
    respondWith({ error: { message: 'Too many calls', code: 4 } }, 429);
    await expect(makeService().send([event])).rejects.not.toBeInstanceOf(MetaPermanentError);
  });

  it('does nothing at all for an empty batch', async () => {
    const fetchMock = respondWith({});
    expect(await makeService().send([])).toEqual({ eventsReceived: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
