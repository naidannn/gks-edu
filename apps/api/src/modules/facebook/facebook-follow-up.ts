import { FacebookFollowUp, FacebookSender } from '../../prisma/client.js';
import { STANDARD_WINDOW_MS, isStickerOnly } from './facebook-rules.js';

/**
 * The pure half of the Messenger follow-up (2G-07): who gets one, when, and
 * what it says. Nest- and Prisma-free so every rule is a row in a test.
 *
 * Meta's rule decides the shape of all of it. Inside 24 hours of the contact's
 * last message the Page may write anything, promotional included; after that
 * only a human may write, under the `HUMAN_AGENT` tag, and never a promotion
 * nor an automated message. So every follow-up here goes out inside those 24
 * hours or not at all — the assistant never touches the human tag.
 *
 * The website is offered only here, once a conversation has ended. While a
 * person is talking to us, the conversation is the sale; "read it on the
 * website" in the middle of it is how they leave (the office's call,
 * 2026-10-12).
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Silence after the assistant's unanswered question before the nudge. */
export const NUDGE_AFTER_MS = 30 * MINUTE_MS;
/** A nudge is for a conversation that just stopped; three hours on it is a stranger's message. */
const NUDGE_STALE_MS = 3 * HOUR_MS;
/** When the promotional message is due, counted from the contact's last message. */
export const PROMO_AFTER_MS = 20 * HOUR_MS;
/** Earliest a promo may go when the 20-hour mark falls in the night. */
const PROMO_EARLIEST_MS = 12 * HOUR_MS;
/** Somebody who booked hears from us once, a couple of hours after going quiet. */
export const BOOKED_AFTER_MS = 2 * HOUR_MS;
/** Never closer to the end of Meta's window than this: the send must land inside it. */
const WINDOW_MARGIN_MS = 30 * MINUTE_MS;
/** Nobody gets more than this many automatic follow-ups, ever (AI-SALES-IMPROVEMENT.md §4.2). */
export const MAX_FOLLOW_UPS = 3;
/** One promotion a week, however often the person comes back and goes quiet. */
const PROMO_COOLDOWN_MS = 7 * 24 * HOUR_MS;

/** Ulaanbaatar is UTC+8 all year. */
const OFFICE_OFFSET_MS = 8 * HOUR_MS;
/** Hours (Ulaanbaatar) a follow-up may arrive in: nobody wants a promotion at 2 a.m. */
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;

const SITE = 'https://gksedu.mn';

// ─── what the person was asking about ────────────────────────────────────────

export type FollowUpTopic = 'GKS' | 'GRADUATE' | 'LANGUAGE' | 'BACHELOR' | 'GENERAL';

/**
 * Read off the words, because the profile is almost always empty — on
 * 2026-10-12, 278 of 317 Messenger sessions had no `goalLevel`. What people do
 * type is the ad's buttons ("Бакалаврын мэдээлэл авах", "Засгын газрын
 * тэтгэлэг"), in Cyrillic or Latin.
 */
const TOPIC_PATTERNS: [FollowUpTopic, RegExp][] = [
  ['GKS', /gks|гкс|тэтгэл|tetgel|засг[иы]йн газр|засгын газр|zasg(?:ii|iin|in)n? gaz/i],
  ['GRADUATE', /магистр|доктор|magistr|doktor|master|phd/i],
  ['LANGUAGE', /хэлний бэлтгэл|helnii beltgel|хэл сур|hel sur|language/i],
  ['BACHELOR', /бакалавр|bakalavr|bachelor|12[- ]?(?:р|r|dugaar)? ?анги|12[- ]?(?:r)? ?angi/i],
];

const GOAL_TOPIC: Record<string, FollowUpTopic> = {
  GKS_SCHOLARSHIP: 'GKS',
  MASTER: 'GRADUATE',
  PHD: 'GRADUATE',
  LANGUAGE_PREP: 'LANGUAGE',
  BACHELOR: 'BACHELOR',
};

/**
 * The topic of the latest message that names one, else the saved goal.
 * Newest first: somebody who opened on "Бакалавр" and moved on to "тэтгэлгээр"
 * is asking about the scholarship now.
 */
export function followUpTopic(contactTexts: string[], goalLevel?: string | null): FollowUpTopic {
  for (const text of [...contactTexts].reverse()) {
    for (const [topic, pattern] of TOPIC_PATTERNS) {
      if (pattern.test(text)) return topic;
    }
  }
  return (goalLevel && GOAL_TOPIC[goalLevel]) || 'GENERAL';
}

// ─── "do not write to me" ─────────────────────────────────────────────────────

/**
 * Whether a message tells us to stop.
 *
 * A question is never a refusal — "IELTS хэрэггүй юу?" asks whether a score is
 * needed. A false positive costs one promotion nobody receives; a false
 * negative is a promotion sent to somebody who said no, so the net is wide.
 */
export function isFollowUpRefusal(text: string | null): boolean {
  const line = text?.trim().toLowerCase();
  if (!line || line.includes('?')) return false;
  return /хэрэггүй|hereggui|heregui|сонирхохгүй|sonirhohgui|битгий|bitgii|бүү бич|дахиж бич|мессеж бүү|spam|спам|unsubscribe|^stop\b|^зогс/.test(
    line,
  );
}

// ─── when ─────────────────────────────────────────────────────────────────────

/** Whether `at` is inside the hours a follow-up may arrive (Ulaanbaatar). */
export function isDaytime(at: Date): boolean {
  const hour = new Date(at.getTime() + OFFICE_OFFSET_MS).getUTCHours();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

/** Whether any daytime moment exists in `[from, to]`, checked on the half hour. */
function daytimeBetween(from: Date, to: Date): boolean {
  for (let t = from.getTime(); t <= to.getTime(); t += 30 * MINUTE_MS) {
    if (isDaytime(new Date(t))) return true;
  }
  return false;
}

export interface FollowUpMessage {
  sender: FacebookSender;
  text: string | null;
  attachments?: { type: string }[];
  followUp: FacebookFollowUp | null;
  /** A `PAGE` echo that was Business Suite's automation, not a person (`isAutomatedEcho`). */
  automated?: boolean;
  createdAt: Date;
}

export interface FollowUpThread {
  lastInboundAt: Date | null;
  needsStaff: boolean;
  followUpOptOut: boolean;
  /** A lead is on the thread or its session: they booked a consultation. */
  booked: boolean;
  /** A contracted client, or a lead the office already won or lost. */
  excluded: boolean;
}

/**
 * Which follow-up, if any, is due now.
 *
 * `messages` is the thread's recent history, oldest first — at least the last
 * 24 hours — and `allFollowUps` every follow-up the thread ever had.
 */
export function dueFollowUp(
  thread: FollowUpThread,
  messages: FollowUpMessage[],
  allFollowUps: { kind: FacebookFollowUp; at: Date }[],
  now: Date = new Date(),
): FacebookFollowUp | null {
  if (thread.needsStaff || thread.followUpOptOut || thread.excluded || !thread.lastInboundAt) return null;
  if (allFollowUps.length >= MAX_FOLLOW_UPS) return null;

  const lastInbound = thread.lastInboundAt.getTime();
  const silence = now.getTime() - lastInbound;
  const windowEnds = lastInbound + STANDARD_WINDOW_MS - WINDOW_MARGIN_MS;
  if (now.getTime() > windowEnds) return null;

  const last = messages.at(-1);
  if (!last) return null;
  // The last word must be the assistant's — or the contact's 👍 after it. A
  // question still waiting is the reply job's; a person's reply means a person
  // has the conversation.
  const contactThanked =
    last.sender === FacebookSender.CONTACT && isStickerOnly(last.text, last.attachments ?? []);
  if (last.sender !== FacebookSender.AI && !contactThanked) return null;

  const since = messages.filter((message) => message.createdAt.getTime() > lastInbound - STANDARD_WINDOW_MS);
  // A human wrote in the last day: it is their conversation, not the bot's.
  // Business Suite's own greeting is not a person.
  const human = (message: FollowUpMessage) =>
    message.sender === FacebookSender.STAFF || (message.sender === FacebookSender.PAGE && !message.automated);
  if (since.some(human)) {
    return null;
  }
  const words = since.filter((message) => message.sender === FacebookSender.CONTACT && message.text?.trim());
  const answered = since.some((message) => message.sender === FacebookSender.AI && !message.followUp);
  if (words.length === 0 || !answered) return null;

  const sentThisRound = new Set(
    messages
      .filter((message) => message.followUp && message.createdAt.getTime() > lastInbound)
      .map((message) => message.followUp),
  );

  if (thread.booked) {
    // Once, ever, however many conversations come after the booking.
    if (allFollowUps.some((followUp) => followUp.kind === FacebookFollowUp.BOOKED)) return null;
    return silence >= BOOKED_AFTER_MS && isDaytime(now) ? FacebookFollowUp.BOOKED : null;
  }

  if (sentThisRound.has(FacebookFollowUp.PROMO)) return null;

  const promoDue =
    !allFollowUps.some(
      (followUp) => followUp.kind === FacebookFollowUp.PROMO && now.getTime() - followUp.at.getTime() < PROMO_COOLDOWN_MS,
    ) &&
    isDaytime(now) &&
    (silence >= PROMO_AFTER_MS ||
      // The 20-hour mark falls in the night and the window shuts before
      // morning: the evening before is the last chance.
      (silence >= PROMO_EARLIEST_MS &&
        !daytimeBetween(new Date(Math.max(now.getTime() + 30 * MINUTE_MS, lastInbound + PROMO_AFTER_MS)), new Date(windowEnds))));
  if (promoDue) return FacebookFollowUp.PROMO;

  // The nudge: a real back-and-forth that stopped on the assistant's question.
  if (
    !sentThisRound.has(FacebookFollowUp.NUDGE) &&
    !contactThanked &&
    words.length >= 2 &&
    endsWithQuestion(last.text) &&
    silence >= NUDGE_AFTER_MS &&
    silence < NUDGE_STALE_MS &&
    isDaytime(now)
  ) {
    return FacebookFollowUp.NUDGE;
  }

  return null;
}

function endsWithQuestion(text: string | null): boolean {
  return /\?\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]*$/u.test(text?.trim() ?? '');
}

// ─── what it says ────────────────────────────────────────────────────────────

/**
 * A link to our site, tagged so the lead it brings is credited to the
 * follow-up: the website keeps the first `utm_*` it sees and every public form
 * sends it (`apps/web/app/utils/attribution.ts`).
 */
export function siteLink(path: string, kind: FacebookFollowUp): string {
  const query = new URLSearchParams({
    utm_source: 'facebook',
    utm_medium: 'messenger',
    utm_campaign: 'follow-up',
    utm_content: kind.toLowerCase(),
  });
  return `${SITE}${path}?${query.toString()}`;
}

const TOPIC_PAGE: Record<FollowUpTopic, { path: string; about: string }> = {
  GKS: { path: '/gks-scholarship', about: 'GKS тэтгэлгийн хугацаа, шаардлага' },
  GRADUATE: { path: '/services/graduate', about: 'Магистр, докторын хөтөлбөрүүд' },
  LANGUAGE: { path: '/services/language-prep', about: 'Хэлний бэлтгэлийн сургуулиуд, хугацаа' },
  BACHELOR: { path: '/services/bachelor', about: 'Бакалаврын сургуулиуд, элсэлтийн нөхцөл' },
  GENERAL: { path: '/universities', about: 'Солонгосын 135 их сургуулийн мэдээлэл' },
};

/** The message itself. Plain text — Messenger prints markdown as asterisks. */
export function followUpText(kind: FacebookFollowUp, topic: FollowUpTopic): string {
  const page = TOPIC_PAGE[topic];
  const link = siteLink(page.path, kind);

  switch (kind) {
    case FacebookFollowUp.NUDGE:
      return [
        'Завтай үедээ хариулаарай — үргэлжлүүлээд тусалъя 🙂',
        `Энэ хооронд манай сайтаас дэлгэрэнгүйг харж болно — ${page.about}: ${link}`,
      ].join('\n');

    case FacebookFollowUp.BOOKED:
      return [
        'Зөвлөгөөнд бүртгүүлсэнд баярлалаа 🙂',
        `Зөвлөхтэйгөө ярихаас өмнө эндээс танилцаад, асуух зүйлээ бэлдээрэй — ${page.about}: ${link}`,
      ].join('\n');

    case FacebookFollowUp.PROMO:
      return promoText(topic, link);
  }
}

/**
 * The question a promotion ends on. The assistant answers it right here in the
 * chat (`search_programs`, `search_universities`) from what the person already
 * told it: a bare "Тийм" is enough, because the follow-up is in the history it
 * reads. No living costs — the catalogue has no dormitory or living-cost
 * figures, and a number the assistant cannot look up is one it makes up.
 */
const OFFER: Record<FollowUpTopic, string> = {
  GKS: 'Хүсвэл GKS-ээр сурч болох, танд тохирох сургуулиудыг анги, танхимтай нь энд шууд гаргаад өгье — авах уу?',
  BACHELOR: 'Хүсвэл танд тохирох сургуулиудыг анги, танхим, сургалтын төлбөр, тэтгэлэгтэй нь энд шууд гаргаад өгье — авах уу?',
  GRADUATE: 'Хүсвэл танд тохирох сургуулиудыг анги, танхим, сургалтын төлбөр, тэтгэлэгтэй нь энд шууд гаргаад өгье — авах уу?',
  LANGUAGE: 'Хүсвэл танд тохирох хэлний бэлтгэлийн сургуулиудыг төлбөр, элсэлтийн улиралтай нь энд шууд гаргаад өгье — авах уу?',
  GENERAL: 'Хүсвэл танд тохирох сургуулиудыг анги, танхим, сургалтын төлбөр, тэтгэлэгтэй нь энд шууд гаргаад өгье — авах уу?',
};

function promoText(topic: FollowUpTopic, link: string): string {
  const ask = 'Асуух зүйл гарвал энд бичээрэй, эсвэл утасны дугаараа үлдээвэл зөвлөх тань руу залгана.';
  switch (topic) {
    case 'GKS':
      return [
        'Сайн байна уу 🙂 Солонгосын засгийн газрын GKS тэтгэлэг — сургалтын төлбөр, амьжиргааны тэтгэмж, нислэг бүгд багтдаг.',
        `Тэнцэх боломжоо 1 минутад шалгаарай: ${siteLink('/gks-check', FacebookFollowUp.PROMO)}`,
        `Хугацаа, шаардлага: ${link}`,
        ask,
        OFFER[topic],
      ].join('\n');
    case 'BACHELOR':
      return [
        'Сайн байна уу 🙂 Солонгост бакалаврт суралцах сургуулиа рэйтинг, сургалтын төлбөрөөр нь харьцуулж сонгоорой:',
        siteLink('/universities', FacebookFollowUp.PROMO),
        `Бакалаврын үйлчилгээ, элсэлтийн нөхцөл: ${link}`,
        ask,
        OFFER[topic],
      ].join('\n');
    case 'GRADUATE':
      return [
        'Сайн байна уу 🙂 Солонгост магистр, докторт суралцах хөтөлбөрүүдийг чиглэл, төлбөрөөр нь хайгаарай:',
        siteLink('/programs', FacebookFollowUp.PROMO),
        `Магистр, докторын үйлчилгээ: ${link}`,
        ask,
        OFFER[topic],
      ].join('\n');
    case 'LANGUAGE':
      return [
        'Сайн байна уу 🙂 Солонгос хэлний бэлтгэлийн сургуулиуд, элсэлтийн улирал, төлбөрийг нэг дороос харна уу:',
        link,
        ask,
        OFFER[topic],
      ].join('\n');
    case 'GENERAL':
      return [
        'Сайн байна уу 🙂 Солонгост суралцах төлөвлөгөөгөө 2 минутад гаргаарай — танд тохирох сургууль, хугацааг санал болгоно:',
        siteLink('/plan', FacebookFollowUp.PROMO),
        `Их сургуулиудын мэдээлэл: ${link}`,
        ask,
        OFFER[topic],
      ].join('\n');
  }
}
