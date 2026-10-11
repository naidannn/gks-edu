import { describe, expect, it } from 'vitest';
import { FacebookFollowUp, FacebookSender } from '../../prisma/client.js';
import {
  MAX_FOLLOW_UPS,
  dueFollowUp,
  followUpText,
  followUpTopic,
  isDaytime,
  isFollowUpRefusal,
  siteLink,
  type FollowUpMessage,
  type FollowUpThread,
} from './facebook-follow-up.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** 11:00 in Ulaanbaatar. */
const T = new Date('2026-10-12T03:00:00Z');

function at(base: Date, offset: number): Date {
  return new Date(base.getTime() + offset);
}

function conversation(base: Date = T, aiText = 'Аль хотод сурмаар байна вэ?'): FollowUpMessage[] {
  return [
    { sender: FacebookSender.CONTACT, text: 'Бакалаврын мэдээлэл авах', followUp: null, createdAt: at(base, -60_000) },
    { sender: FacebookSender.AI, text: 'Сайн байна уу! Та хэддүгээр анги вэ?', followUp: null, createdAt: at(base, -50_000) },
    { sender: FacebookSender.CONTACT, text: '12р анги төгсөж байгаа', followUp: null, createdAt: base },
    { sender: FacebookSender.AI, text: aiText, followUp: null, createdAt: at(base, 10_000) },
  ];
}

function thread(overrides: Partial<FollowUpThread> = {}, base: Date = T): FollowUpThread {
  return { lastInboundAt: base, needsStaff: false, followUpOptOut: false, booked: false, excluded: false, ...overrides };
}

describe('dueFollowUp — the nudge', () => {
  it('nudges 30 minutes after the assistant asked and nobody answered', () => {
    expect(dueFollowUp(thread(), conversation(), [], at(T, 31 * MIN))).toBe(FacebookFollowUp.NUDGE);
  });

  it('waits the full 30 minutes', () => {
    expect(dueFollowUp(thread(), conversation(), [], at(T, 20 * MIN))).toBeNull();
  });

  it('does not nudge when the assistant asked nothing', () => {
    expect(dueFollowUp(thread(), conversation(T, 'Бакалаврт 4 жил суралцана.'), [], at(T, 31 * MIN))).toBeNull();
  });

  it('counts a question that ends in an emoji', () => {
    expect(dueFollowUp(thread(), conversation(T, 'Аль хотод сурмаар байна вэ? 🙂'), [], at(T, 31 * MIN))).toBe(
      FacebookFollowUp.NUDGE,
    );
  });

  it('needs a real back-and-forth, not a single button press', () => {
    const messages = conversation().slice(2);
    expect(dueFollowUp(thread(), messages, [], at(T, 31 * MIN))).toBeNull();
  });

  it('is only for a conversation that just stopped', () => {
    expect(dueFollowUp(thread(), conversation(), [], at(T, 3 * HOUR + MIN))).toBeNull();
  });

  it('is sent once', () => {
    const messages = [
      ...conversation(),
      { sender: FacebookSender.AI, text: 'Завтай үедээ…', followUp: FacebookFollowUp.NUDGE, createdAt: at(T, 31 * MIN) },
    ];
    const sent = [{ kind: FacebookFollowUp.NUDGE, at: at(T, 31 * MIN) }];
    expect(dueFollowUp(thread(), messages, sent, at(T, 40 * MIN))).toBeNull();
  });

  it('does not nudge somebody who closed with a 👍', () => {
    const messages = [
      ...conversation(),
      { sender: FacebookSender.CONTACT, text: null, attachments: [{ type: 'sticker' }], followUp: null, createdAt: at(T, MIN) },
    ];
    expect(dueFollowUp(thread({}, at(T, MIN)), messages, [], at(T, 40 * MIN))).toBeNull();
  });

  it('keeps quiet at night', () => {
    const night = new Date('2026-10-12T15:00:00Z'); // 23:00 UB
    expect(dueFollowUp(thread({}, night), conversation(night), [], at(night, 31 * MIN))).toBeNull();
  });
});

describe('dueFollowUp — the promotion', () => {
  const evening = new Date('2026-10-12T12:00:00Z'); // 20:00 UB → +20 h is 16:00 UB

  it('goes 20 hours after the contact last wrote', () => {
    expect(dueFollowUp(thread({}, evening), conversation(evening), [], at(evening, 20 * HOUR))).toBe(
      FacebookFollowUp.PROMO,
    );
    expect(dueFollowUp(thread({}, evening), conversation(evening), [], at(evening, 19 * HOUR))).toBeNull();
  });

  it('follows a nudge in the same conversation', () => {
    const messages = [
      ...conversation(evening),
      { sender: FacebookSender.AI, text: '…', followUp: FacebookFollowUp.NUDGE, createdAt: at(evening, 31 * MIN) },
    ];
    const sent = [{ kind: FacebookFollowUp.NUDGE, at: at(evening, 31 * MIN) }];
    expect(dueFollowUp(thread({}, evening), messages, sent, at(evening, 20 * HOUR))).toBe(FacebookFollowUp.PROMO);
  });

  it('reaches somebody who closed with a 👍', () => {
    const messages = [
      ...conversation(evening),
      {
        sender: FacebookSender.CONTACT,
        text: null,
        attachments: [{ type: 'sticker' }],
        followUp: null,
        createdAt: at(evening, MIN),
      },
    ];
    expect(dueFollowUp(thread({}, at(evening, MIN)), messages, [], at(evening, 20 * HOUR + MIN))).toBe(
      FacebookFollowUp.PROMO,
    );
  });

  it('waits for morning when the 20-hour mark is at night and the window is still open then', () => {
    // 11:00 UB → +20 h is 07:00 UB; the window lasts until 10:30 UB.
    expect(dueFollowUp(thread(), conversation(), [], at(T, 20 * HOUR))).toBeNull();
    expect(dueFollowUp(thread(), conversation(), [], at(T, 22 * HOUR))).toBe(FacebookFollowUp.PROMO);
  });

  it('goes the evening before when the window shuts before morning', () => {
    const early = new Date('2026-10-12T00:00:00Z'); // 08:00 UB → window shuts 07:30 UB next day
    expect(dueFollowUp(thread({}, early), conversation(early), [], at(early, 12 * HOUR))).toBe(FacebookFollowUp.PROMO);
    expect(dueFollowUp(thread({}, early), conversation(early), [], at(early, 11 * HOUR))).toBeNull();
  });

  it('never goes after Meta’s 24 hours', () => {
    expect(dueFollowUp(thread({}, evening), conversation(evening), [], at(evening, 24 * HOUR))).toBeNull();
  });

  it('goes once a week at most', () => {
    const sent = [{ kind: FacebookFollowUp.PROMO, at: at(evening, -3 * 24 * HOUR) }];
    expect(dueFollowUp(thread({}, evening), conversation(evening), sent, at(evening, 20 * HOUR))).toBeNull();
  });
});

describe('dueFollowUp — who never gets one', () => {
  const evening = new Date('2026-10-12T12:00:00Z');
  const due = at(evening, 20 * HOUR);

  it.each([
    ['opted out', { followUpOptOut: true }],
    ['waiting for staff', { needsStaff: true }],
    ['a client, or a lead the office closed', { excluded: true }],
  ])('%s', (_label, overrides) => {
    expect(dueFollowUp(thread(overrides, evening), conversation(evening), [], due)).toBeNull();
  });

  it('somebody who already had three', () => {
    const sent = Array.from({ length: MAX_FOLLOW_UPS }, (_, index) => ({
      kind: FacebookFollowUp.NUDGE,
      at: at(evening, -(index + 10) * 24 * HOUR),
    }));
    expect(dueFollowUp(thread({}, evening), conversation(evening), sent, due)).toBeNull();
  });

  it('a conversation a person from the office took over', () => {
    const messages = [
      ...conversation(evening),
      { sender: FacebookSender.STAFF, text: 'Би залгая', followUp: null, createdAt: at(evening, 5 * MIN) },
    ];
    expect(dueFollowUp(thread({}, evening), messages, [], due)).toBeNull();
  });

  it('but not one where only Business Suite’s greeting went out', () => {
    const messages = [
      { sender: FacebookSender.PAGE, text: 'Сайн байна уу', followUp: null, automated: true, createdAt: at(evening, -55_000) },
      ...conversation(evening),
    ];
    expect(dueFollowUp(thread({}, evening), messages, [], due)).toBe(FacebookFollowUp.PROMO);
  });

  it('a thread whose last message is the contact’s question', () => {
    const messages = conversation(evening).slice(0, 3);
    expect(dueFollowUp(thread({}, evening), messages, [], due)).toBeNull();
  });
});

describe('dueFollowUp — somebody who booked', () => {
  it('gets one message, a couple of hours on, and nothing else', () => {
    const booked = thread({ booked: true });
    expect(dueFollowUp(booked, conversation(), [], at(T, 31 * MIN))).toBeNull();
    expect(dueFollowUp(booked, conversation(), [], at(T, 2 * HOUR))).toBe(FacebookFollowUp.BOOKED);

    const sent = [{ kind: FacebookFollowUp.BOOKED, at: at(T, 2 * HOUR) }];
    expect(dueFollowUp(booked, conversation(), sent, at(T, 22 * HOUR))).toBeNull();
  });
});

describe('isFollowUpRefusal', () => {
  it.each([
    ['Хэрэггүй ээ баярлалаа', true],
    ['hereggui bolson', true],
    ['Дахиж бичээд байх хэрэггүй', true],
    ['битгий бичээрэй', true],
    ['Сонирхохгүй байна', true],
    ['stop', true],
    ['IELTS хэрэггүй юу?', false],
    ['Бакалаврын мэдээлэл авах', false],
    ['Баярлалаа', false],
    [null, false],
  ])('%s → %s', (text, expected) => {
    expect(isFollowUpRefusal(text)).toBe(expected);
  });
});

describe('followUpTopic', () => {
  it.each([
    [['Бакалаврын мэдээлэл авах'], 'BACHELOR'],
    [['Бакалаврын мэдээлэл авах', 'Tetgelgeer'], 'GKS'],
    [['Засгын газрын тэтгэлэг'], 'GKS'],
    [['Магистр, докторын мэдээлэл авах'], 'GRADUATE'],
    [['Хэлний бэлтгэл, Үндсэн анги'], 'LANGUAGE'],
    [['12r angia tugsuj bga'], 'BACHELOR'],
    [['Сайн байна уу'], 'GENERAL'],
  ])('%j → %s', (texts, expected) => {
    expect(followUpTopic(texts)).toBe(expected);
  });

  it('falls back to the saved goal', () => {
    expect(followUpTopic(['Сайн байна уу'], 'MASTER')).toBe('GRADUATE');
  });
});

describe('the message', () => {
  it('tags every link to the website with the follow-up', () => {
    expect(siteLink('/plan', FacebookFollowUp.PROMO)).toBe(
      'https://gksedu.mn/plan?utm_source=facebook&utm_medium=messenger&utm_campaign=follow-up&utm_content=promo',
    );
  });

  it.each(['GKS', 'GRADUATE', 'LANGUAGE', 'BACHELOR', 'GENERAL'] as const)('%s: plain text with a link', (topic) => {
    for (const kind of [FacebookFollowUp.NUDGE, FacebookFollowUp.PROMO, FacebookFollowUp.BOOKED]) {
      const text = followUpText(kind, topic);
      expect(text).toContain('https://gksedu.mn/');
      expect(text).toContain(`utm_content=${kind.toLowerCase()}`);
      expect(text).not.toMatch(/\*\*|\]\(/);
      expect(text.length).toBeLessThan(600);
    }
  });
});

describe('isDaytime', () => {
  it.each([
    ['2026-10-12T00:59:00Z', false], // 08:59 UB
    ['2026-10-12T01:00:00Z', true], // 09:00 UB
    ['2026-10-12T12:59:00Z', true], // 20:59 UB
    ['2026-10-12T13:00:00Z', false], // 21:00 UB
  ])('%s → %s', (iso, expected) => {
    expect(isDaytime(new Date(iso))).toBe(expected);
  });
});
