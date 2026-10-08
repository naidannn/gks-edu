import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assistantActive,
  isAnswerableComment,
  messagingWindow,
  splitForMessenger,
  toMessengerText,
  verifySignature,
} from './facebook-rules.js';
import { pageEvents } from './facebook-webhook.js';

const HOUR = 60 * 60 * 1000;

describe('verifySignature', () => {
  const secret = 'app-secret';
  // Meta signs the bytes it sent — including an escaped character that a
  // parse-and-reserialise round trip would turn back into "é".
  const raw = Buffer.from('{"object":"page","entry":[{"id":"1","x":"caf\\u00e9"}]}');
  const good = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

  it('accepts the HMAC of the exact bytes', () => {
    expect(verifySignature(raw, good, secret)).toBe(true);
  });

  it('refuses a re-serialised body, a wrong secret, a missing or malformed header', () => {
    const reserialised = Buffer.from(JSON.stringify(JSON.parse(raw.toString())));
    expect(verifySignature(reserialised, good, secret)).toBe(false);
    expect(verifySignature(raw, good, 'other')).toBe(false);
    expect(verifySignature(raw, undefined, secret)).toBe(false);
    expect(verifySignature(raw, good.replace('sha256=', 'sha1='), secret)).toBe(false);
    expect(verifySignature(raw, 'sha256=abc', secret)).toBe(false);
  });

  it('refuses everything when no secret is configured', () => {
    expect(verifySignature(raw, good, '')).toBe(false);
  });
});

describe('messagingWindow', () => {
  const now = new Date('2026-10-09T12:00:00Z');

  it.each([
    [null, 'CLOSED'],
    [new Date(now.getTime() - 1 * HOUR), 'OPEN'],
    [new Date(now.getTime() - 24 * HOUR), 'OPEN'],
    [new Date(now.getTime() - 25 * HOUR), 'HUMAN_AGENT'],
    [new Date(now.getTime() - 7 * 24 * HOUR), 'HUMAN_AGENT'],
    [new Date(now.getTime() - 7 * 24 * HOUR - 1), 'CLOSED'],
  ])('last inbound %s → %s', (lastInboundAt, expected) => {
    expect(messagingWindow(lastInboundAt, now)).toBe(expected);
  });
});

describe('assistantActive', () => {
  const now = new Date('2026-10-09T12:00:00Z');
  const on = { enabled: true, facebookEnabled: true };

  it('answers an AUTO thread with no pause', () => {
    expect(assistantActive({ aiMode: 'AUTO', aiPausedUntil: null }, on, now)).toBe(true);
  });

  it('stays quiet while a person has the thread, and resumes after', () => {
    const later = new Date(now.getTime() + HOUR);
    const earlier = new Date(now.getTime() - HOUR);
    expect(assistantActive({ aiMode: 'AUTO', aiPausedUntil: later }, on, now)).toBe(false);
    expect(assistantActive({ aiMode: 'AUTO', aiPausedUntil: earlier }, on, now)).toBe(true);
  });

  it('obeys the thread switch, the channel switch and the global kill switch', () => {
    expect(assistantActive({ aiMode: 'OFF', aiPausedUntil: null }, on, now)).toBe(false);
    expect(assistantActive({ aiMode: 'AUTO', aiPausedUntil: null }, { enabled: true, facebookEnabled: false }, now)).toBe(false);
    expect(assistantActive({ aiMode: 'AUTO', aiPausedUntil: null }, { enabled: false, facebookEnabled: true }, now)).toBe(false);
  });
});

describe('toMessengerText', () => {
  it('drops citation markers with the space before them', () => {
    expect(toMessengerText('Урьдчилгаа 200,000₮ [T1]. Хугацаа 10/15 [K2, T3].')).toBe(
      'Урьдчилгаа 200,000₮. Хугацаа 10/15.',
    );
  });

  it('turns markdown Messenger would print literally into plain text', () => {
    const answer = '## Алхам\n\n- **Нэгдүгээр:** материал\n- `TOPIK` шалгалт\n\n[Төлөвлөгөө](https://gksedu.mn/plan) үзнэ үү';
    expect(toMessengerText(answer)).toBe(
      'Алхам\n\n• Нэгдүгээр: материал\n• TOPIK шалгалт\n\nТөлөвлөгөө: https://gksedu.mn/plan үзнэ үү',
    );
  });

  it('leaves ordinary text alone', () => {
    expect(toMessengerText('Сайн байна уу? 3*4 = 12 гэж бодъё.')).toBe('Сайн байна уу? 3*4 = 12 гэж бодъё.');
  });
});

describe('splitForMessenger', () => {
  it('keeps a short answer whole', () => {
    expect(splitForMessenger('Сайн байна уу.')).toEqual(['Сайн байна уу.']);
  });

  it('cuts at a paragraph, then a sentence, never inside the limit', () => {
    const paragraph = 'а'.repeat(60);
    const text = `${paragraph}\n\n${paragraph}`;
    expect(splitForMessenger(text, 100)).toEqual([paragraph, paragraph]);

    const sentences = `${'б'.repeat(70)}. ${'в'.repeat(70)}.`;
    const parts = splitForMessenger(sentences, 100);
    expect(parts).toEqual([`${'б'.repeat(70)}.`, `${'в'.repeat(70)}.`]);
    expect(parts.every((part) => part.length <= 100)).toBe(true);
  });

  it('hard-cuts a single unbroken run', () => {
    const parts = splitForMessenger('x'.repeat(250), 100);
    expect(parts.map((part) => part.length)).toEqual([100, 100, 50]);
  });
});

describe('isAnswerableComment', () => {
  it.each([
    ['Үнэ хэд вэ?', true],
    ['үнэ?', true],
    ['инфо', true],
    ['Мэдээлэл авъя', true],
    ['😍😍😍', false],
    ['👍', false],
    ['.', false],
    ['@Бат', false],
  ])('%s → %s', (text, expected) => {
    expect(isAnswerableComment(text)).toBe(expected);
  });

  it('skips a comment that is only tagged names', () => {
    expect(isAnswerableComment('Бат Дорж', 1)).toBe(false);
    expect(isAnswerableComment('Бат Дорж үүнийг хар, хэд вэ?', 1)).toBe(true);
  });
});

describe('pageEvents', () => {
  const opts = { pageId: 'PAGE', appId: '777' };

  it('reads a message, a postback and an ad referral', () => {
    const events = pageEvents(
      {
        id: 'PAGE',
        messaging: [
          {
            sender: { id: 'U1' },
            recipient: { id: 'PAGE' },
            timestamp: 1_760_000_000_000,
            message: {
              mid: 'm1',
              text: 'Сайн уу',
              referral: { source: 'ADS', type: 'OPEN_THREAD', ad_id: 'AD9' },
              attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }],
            },
          },
          { sender: { id: 'U1' }, recipient: { id: 'PAGE' }, timestamp: 2, postback: { mid: 'p1', title: 'Үнэ', payload: 'PRICE' } },
        ],
      },
      opts,
    );

    expect(events).toEqual([
      {
        kind: 'message',
        psid: 'U1',
        mid: 'm1',
        text: 'Сайн уу',
        attachments: [{ type: 'image', url: 'https://cdn/x.jpg' }],
        at: new Date(1_760_000_000_000),
        referral: { source: 'ADS', type: 'OPEN_THREAD', ad_id: 'AD9' },
      },
      { kind: 'message', psid: 'U1', mid: 'p1', text: 'Үнэ', attachments: [], at: new Date(2), referral: null },
    ]);
  });

  it('tells our echoes from a person typing in Business Suite', () => {
    const echo = (message: Record<string, unknown>) =>
      pageEvents(
        { id: 'PAGE', messaging: [{ sender: { id: 'PAGE' }, recipient: { id: 'U1' }, timestamp: 1, message: { is_echo: true, mid: 'e', ...message } }] },
        opts,
      )[0];

    expect(echo({ metadata: 'gksedu' })).toMatchObject({ kind: 'echo', psid: 'U1', ours: true });
    expect(echo({ app_id: 777 })).toMatchObject({ ours: true });
    expect(echo({ app_id: 263902037430900, text: 'Сайн байна уу' })).toMatchObject({ ours: false, text: 'Сайн байна уу' });
  });

  it('reads a new comment, skips the Page’s own and non-add verbs, reports removals', () => {
    const events = pageEvents(
      {
        id: 'PAGE',
        changes: [
          { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'C1', post_id: 'PAGE_P1', parent_id: 'PAGE_P1', from: { id: 'X', name: 'Сараа' }, message: 'Үнэ?', created_time: 1_760_000_000 } },
          { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'C2', post_id: 'PAGE_P1', from: { id: 'PAGE' }, message: 'inbox-оор' } },
          { field: 'feed', value: { item: 'comment', verb: 'edited', comment_id: 'C1', post_id: 'PAGE_P1', from: { id: 'X' } } },
          { field: 'feed', value: { item: 'reaction', verb: 'add', post_id: 'PAGE_P1' } },
          { field: 'feed', value: { item: 'comment', verb: 'remove', comment_id: 'C3', post_id: 'PAGE_P1' } },
        ],
      },
      opts,
    );

    expect(events).toEqual([
      {
        kind: 'comment',
        commentId: 'C1',
        postId: 'PAGE_P1',
        parentId: null,
        fromId: 'X',
        fromName: 'Сараа',
        text: 'Үнэ?',
        at: new Date(1_760_000_000_000),
      },
      { kind: 'comment_removed', commentId: 'C3' },
    ]);
  });

  it('ignores an entry for a different Page', () => {
    expect(
      pageEvents({ id: 'OTHER', messaging: [{ sender: { id: 'U' }, message: { mid: 'm', text: 'hi' } }] }, opts),
    ).toEqual([]);
  });
});
