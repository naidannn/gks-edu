import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { SlackService } from './slack.service.js';

function makeService(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    'notifications.appUrl': 'https://gksedu.mn',
    'notifications.slack.botToken': 'xoxb-test',
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new SlackService(config);
}

afterEach(() => vi.unstubAllGlobals());

type Reply = Record<string, unknown> | undefined;

/** A fake Slack Web API: answers by method name, `ok: true` unless the reply says otherwise. */
function slackApi(replies: Record<string, Reply | (() => Reply)>) {
  const fetchMock = vi.fn(async (url: string, _init: RequestInit) => {
    const method = url.split('/').pop()!;
    const reply = replies[method];
    const body = typeof reply === 'function' ? reply() : reply;
    return { ok: true, json: async () => ({ ok: true, ...body }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return Object.assign(fetchMock, {
    methods: () => fetchMock.mock.calls.map(([url]) => url.split('/').pop()),
    /** The form body of the n-th call. */
    sent: (n: number) => fetchMock.mock.calls[n]![1].body as URLSearchParams,
  });
}

describe('SlackService', () => {
  it('is disabled — and so logs instead of posting — without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const noToken = makeService({ 'notifications.slack.botToken': '' });
    expect(noToken.enabled).toBe(false);
    await noToken.notify({ topic: 'leads', emoji: '🔔', title: 'Тест' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders a title, drops empty fields and resolves the link against APP_PUBLIC_URL', () => {
    const text = makeService().renderMrkdwn({
      topic: 'leads',
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
      topic: 'leads',
      emoji: '🔔',
      title: 'Тест',
      fields: [{ label: 'Тэмдэглэл', value: '<script> & </script>' }],
    });
    expect(text).toContain('&lt;script&gt; &amp; &lt;/script&gt;');
  });

  it("joins the topic's channel when it exists, then posts there — and looks it up only once", async () => {
    const fetchMock = slackApi({
      'conversations.list': { channels: [{ id: 'C_PAY', name: 'web-payments', is_member: false }] },
    });

    const service = makeService();
    await service.notify({ topic: 'payments', emoji: '💰', title: 'Төлбөр баталгаажлаа' });
    await service.notify({ topic: 'payments', emoji: '💰', title: 'Дахиад' });

    expect(fetchMock.methods()).toEqual([
      'conversations.list',
      'conversations.join',
      'chat.postMessage',
      'chat.postMessage',
    ]);
    const [url, init] = fetchMock.mock.calls[2]!;
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer xoxb-test');
    const body = fetchMock.sent(2);
    expect(body.get('channel')).toBe('C_PAY');
    expect(body.get('text')).toBe('💰 Төлбөр баталгаажлаа');
    expect(JSON.parse(body.get('blocks')!)).toHaveLength(1);
  });

  it('creates a missing channel and posts into it without a join', async () => {
    const fetchMock = slackApi({
      'conversations.list': { channels: [{ id: 'C_OTHER', name: 'release-notes', is_member: false }] },
      'conversations.create': { channel: { id: 'C_NEW', name: 'web-leads' } },
    });

    await makeService().notify({ topic: 'leads', emoji: '🔔', title: 'Тест' });

    expect(fetchMock.methods()).toEqual(['conversations.list', 'conversations.create', 'chat.postMessage']);
    expect(fetchMock.sent(1).get('name')).toBe('web-leads');
    expect(fetchMock.sent(2).get('channel')).toBe('C_NEW');
  });

  it('follows the cursor through every page of channels', async () => {
    const pages = [
      { channels: [{ id: 'C1', name: 'social' }], response_metadata: { next_cursor: 'next' } },
      { channels: [{ id: 'C_CHAT', name: 'web-chat', is_member: true }], response_metadata: { next_cursor: '' } },
    ];
    const fetchMock = slackApi({ 'conversations.list': () => pages.shift() });

    await makeService().notify({ topic: 'chat', emoji: '💬', title: 'Тест' });

    expect(fetchMock.methods()).toEqual(['conversations.list', 'conversations.list', 'chat.postMessage']);
    expect(fetchMock.sent(1).get('cursor')).toBe('next');
  });

  it('retries the lookup after a failed one instead of caching the failure', async () => {
    let fail = true;
    const fetchMock = slackApi({
      'conversations.list': () => (fail ? { ok: false, error: 'ratelimited' } : { channels: [{ id: 'C_AI', name: 'web-ai-alerts', is_member: true }] }),
    });
    const service = makeService();

    await service.notify({ topic: 'ai', emoji: '⚠️', title: 'Тест' });
    fail = false;
    await service.notify({ topic: 'ai', emoji: '⚠️', title: 'Тест' });

    expect(fetchMock.methods()).toEqual(['conversations.list', 'conversations.list', 'chat.postMessage']);
  });

  it('does not post into an archived channel', async () => {
    const fetchMock = slackApi({
      'conversations.list': { channels: [{ id: 'C_OLD', name: 'web-contracts', is_archived: true }] },
    });

    await makeService().notify({ topic: 'contracts', emoji: '✍️', title: 'Тест' });

    expect(fetchMock.methods()).toEqual(['conversations.list']);
  });

  it('swallows an `ok: false` body — Slack answers 200 when it refuses the call', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'not_in_channel' }) }),
    );
    await expect(makeService().notify({ topic: 'leads', emoji: '🔔', title: 'Тест' })).resolves.toBeUndefined();
  });

  it('swallows a transport failure — a business action must not fail on Slack', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    await expect(makeService().notify({ topic: 'leads', emoji: '🔔', title: 'Тест' })).resolves.toBeUndefined();
  });
});
