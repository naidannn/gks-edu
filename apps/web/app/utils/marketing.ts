/**
 * Mongolian labels for the marketing module (1O).
 *
 * Kept out of `labels.ts` only because that file is already the length of a
 * small book; the rule is the same — an enum's wording lives in exactly one
 * place, and no component spells it out for itself.
 */

import type {
  CampaignRecipientStatus,
  EmailCampaignStatus,
  EmailTone,
  MarketingAudience,
  SubscriberStatus,
} from '@gks/shared';
import type { BadgeTone } from './labels';

export const MARKETING_AUDIENCE_LABELS: Record<MarketingAudience, string> = {
  CONTRACT_CLIENTS: 'Гэрээтэй хэрэглэгч',
  CLIENTS: 'Бүртгэлтэй харилцагч',
  LEADS: 'Сэжим (гэрээгүй)',
  SUBSCRIBERS: 'Сайтын захиалагч',
  CUSTOM: 'Гараар оруулсан жагсаалт',
};

/** One line under each audience on the compose screen — who this actually is. */
export const MARKETING_AUDIENCE_HINTS: Record<MarketingAudience, string> = {
  CONTRACT_CLIENTS: 'Зуучлалын гэрээ байгуулсан хүмүүс.',
  CLIENTS: 'Бүртгэгдсэн бүх харилцагч — гэрээтэй эсэхээс үл хамаарна.',
  LEADS: 'Гэрээ болоогүй, харилцагч болж хөрвөөгүй сэжимүүд.',
  SUBSCRIBERS: 'Сайтаас мэдээлэл авахаар өөрсдөө бүртгүүлсэн хүмүүс.',
  CUSTOM: 'Та өөрөө оруулсан имэйл хаягууд.',
};

export const CAMPAIGN_STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  DRAFT: 'Ноорог',
  QUEUED: 'Дараалалд',
  SENDING: 'Илгээж байна',
  SENT: 'Илгээсэн',
  FAILED: 'Амжилтгүй',
  CANCELLED: 'Зогсоосон',
};

export const CAMPAIGN_STATUS_TONE: Record<EmailCampaignStatus, BadgeTone> = {
  DRAFT: 'neutral',
  QUEUED: 'info',
  SENDING: 'info',
  SENT: 'success',
  FAILED: 'danger',
  CANCELLED: 'warning',
};

export const RECIPIENT_STATUS_LABELS: Record<CampaignRecipientStatus, string> = {
  PENDING: 'Хүлээгдэж буй',
  SENT: 'Илгээсэн',
  FAILED: 'Амжилтгүй',
  SKIPPED: 'Алгассан',
};

export const RECIPIENT_STATUS_TONE: Record<CampaignRecipientStatus, BadgeTone> = {
  PENDING: 'neutral',
  SENT: 'success',
  FAILED: 'danger',
  SKIPPED: 'warning',
};

export const SUBSCRIBER_STATUS_LABELS: Record<SubscriberStatus, string> = {
  SUBSCRIBED: 'Захиалсан',
  UNSUBSCRIBED: 'Гарсан',
  BOUNCED: 'Хүрээгүй',
};

export const SUBSCRIBER_STATUS_TONE: Record<SubscriberStatus, BadgeTone> = {
  SUBSCRIBED: 'success',
  UNSUBSCRIBED: 'neutral',
  BOUNCED: 'danger',
};

export const EMAIL_TONE_LABELS: Record<EmailTone, string> = {
  info: 'Мэдээлэл (цэнхэр)',
  success: 'Сайн мэдээ (ногоон)',
  warning: 'Анхааруулга (шар)',
  critical: 'Яаралтай (улаан)',
};

/** What an author may type into a subject or a body. */
export const MARKETING_PLACEHOLDERS: { name: string; label: string }[] = [
  { name: '{{firstName}}', label: 'Нэр' },
  { name: '{{lastName}}', label: 'Овог' },
  { name: '{{fullName}}', label: 'Бүтэн нэр' },
  { name: '{{email}}', label: 'Имэйл хаяг' },
];

/** A campaign is still moving — the detail screen polls while this is true. */
export function isCampaignRunning(status: EmailCampaignStatus): boolean {
  return status === 'QUEUED' || status === 'SENDING';
}
