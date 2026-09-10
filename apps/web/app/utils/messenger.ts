import type { ConversationStatus, ConversationTopic } from '@gks/shared';
import { formatLongDate, formatTime, monthNameMn, weekdayNameMn } from './date';
import type { BadgeTone } from './labels';

/**
 * Mongolian wording for the messenger (1K), kept in one place the way
 * `notifications.ts` keeps its own (CLAUDE.md: enum values stay English in the
 * database, their labels live on the frontend).
 */

export const CONVERSATION_TOPIC_LABELS: Record<ConversationTopic, string> = {
  GENERAL: 'Ерөнхий асуулт',
  ADMISSION: 'Элсэлт, сургууль сонголт',
  DOCUMENTS: 'Материал бүрдүүлэлт',
  CONTRACT: 'Гэрээ, төлбөр',
  VISA: 'Виз',
  DEPARTURE: 'Явах бэлтгэл',
  OTHER: 'Бусад',
};

/** Short enough for a chip on a list row. */
export const CONVERSATION_TOPIC_SHORT: Record<ConversationTopic, string> = {
  GENERAL: 'Ерөнхий',
  ADMISSION: 'Элсэлт',
  DOCUMENTS: 'Материал',
  CONTRACT: 'Гэрээ',
  VISA: 'Виз',
  DEPARTURE: 'Бэлтгэл',
  OTHER: 'Бусад',
};

export const CONVERSATION_TOPIC_ICONS: Record<ConversationTopic, string> = {
  GENERAL: 'message-circle',
  ADMISSION: 'graduation-cap',
  DOCUMENTS: 'folder-open',
  CONTRACT: 'file-text',
  VISA: 'plane',
  DEPARTURE: 'luggage',
  OTHER: 'circle-help',
};

/** The order the "шинэ асуулт" picker offers them in — commonest first. */
export const CONVERSATION_TOPIC_ORDER: ConversationTopic[] = [
  'GENERAL',
  'ADMISSION',
  'DOCUMENTS',
  'CONTRACT',
  'VISA',
  'DEPARTURE',
  'OTHER',
];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  OPEN: 'Нээлттэй',
  RESOLVED: 'Шийдвэрлэсэн',
};

export const CONVERSATION_STATUS_TONE: Record<ConversationStatus, BadgeTone> = {
  OPEN: 'info',
  RESOLVED: 'success',
};

/**
 * The clock on a bubble. Today is a time, this week is a weekday, older is a
 * date — the same ladder every messenger uses, because it is the one that
 * answers "when" in the fewest characters.
 */
export function messageTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatTime(date);
}

/** The heading that separates one day of a thread from the next. */
export function messageDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const daysAgo = Math.round((today.getTime() - day.getTime()) / 86_400_000);

  if (daysAgo === 0) return 'Өнөөдөр';
  if (daysAgo === 1) return 'Өчигдөр';
  if (daysAgo < 7) return weekdayNameMn(date.getDay());

  const sameYear = date.getFullYear() === today.getFullYear();
  return sameYear
    ? `${monthNameMn(date.getMonth() + 1, 'long')}ын ${date.getDate()}`
    : formatLongDate(date);
}

/** "14:32" today, "Мягмар" this week, "9 сарын 2" before that. */
export function threadTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const daysAgo = Math.round((startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (daysAgo === 0) return messageTime(iso);
  if (daysAgo === 1) return 'Өчигдөр';
  if (daysAgo < 7) return weekdayNameMn(date.getDay(), 'short');
  return `${date.getMonth() + 1} сарын ${date.getDate()}`;
}

/** One or two letters for an avatar, from whatever name we actually have. */
export function initials(name: string | null | undefined, fallback = '?'): string {
  const words = (name ?? '').trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return fallback;
  if (words.length === 1) return (words[0] ?? '').slice(0, 1).toUpperCase();
  return `${(words[0] ?? '').slice(0, 1)}${(words[1] ?? '').slice(0, 1)}`.toUpperCase();
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
