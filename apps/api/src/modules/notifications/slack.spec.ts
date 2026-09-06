import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service.js';

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'notifications.appUrl': 'https://gksedu.mn',
    'notifications.slack.botToken': 'xoxb-test',
    'notifications.slack.channelId': 'C123',
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new SlackService(config);
}

afterEach(() => vi.unstubAllGlobals());

describe('SlackService', () => {
  it('is disabled — and so logs instead of posting — until both token and channel are set', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const noToken = makeService({ 'notifications.slack.botToken': '' });
    expect(noToken.enabled).toBe(false);
    await noToken.notify({ emoji: '🔔', title: 'Тест' });
    expect(fetchMock).not.toHaveBeenCalled();

    const noChannel = makeService({ 'notifications.slack.channelId': '' });
    expect(noChannel.enabled).toBe(false);
  });

  it('renders a title, drops empty fields and resolves the link against APP_PUBLIC_URL', () => {
    const text = makeService().renderMrkdwn({
      emoji: '🔔',
      title: 'Шинэ зөвлөгөөний хүсэлт',
      fields: [
        { label: 'Нэр', value: 'Дорж Батболд' },
        { label: 'И-мэйл', value: null },
        { label: 'Тэмдэглэл', value: '' },
      ],
      link: { label: 'CRM дээр нээх', path: '/admin/leads/abc' },
    });

    expect(text).toBe(
      '*🔔 Шинэ зөвлөгөөний хүсэлт*\n' +
        '• *Нэр:* Дорж Батболд\n' +
        '<https://gksedu.mn/admin/leads/abc|CRM дээр нээх>',
    );
  });

  it('escapes the three characters Slack mrkdwn reserves', () => {
    const text = makeService().renderMrkdwn({
      emoji: '🔔',
      title: 'Тест',
      fields: [{ label: 'Тэмдэглэл', value: '<script> & </script>' }],
    });
    expect(text).toContain('&lt;script&gt; &amp; &lt;/script&gt;');
  });

  it('posts to the configured channel', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await makeService().notify({ emoji: '💰', title: 'Төлбөр баталгаажлаа' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer xoxb-test');
    const body = JSON.parse(init.body as string) as { channel: string; text: string };
    expect(body.channel).toBe('C123');
    expect(body.text).toBe('💰 Төлбөр баталгаажлаа');
  });

  it('swallows an `ok: false` body — Slack answers 200 when it refuses the call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'not_in_channel' }) }),
    );
    await expect(makeService().notify({ emoji: '🔔', title: 'Тест' })).resolves.toBeUndefined();
  });

  it('swallows a transport failure — a business action must not fail on Slack', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(makeService().notify({ emoji: '🔔', title: 'Тест' })).resolves.toBeUndefined();
  });
});
