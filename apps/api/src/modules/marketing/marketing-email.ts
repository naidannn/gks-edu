import type { EmailMessage } from '../notifications/email/email-template.js';
import { EMAIL_TONES, type EmailTone } from '../notifications/email/email-brand.js';

/**
 * Turns a campaign row plus one recipient into the message `BrevoService`
 * sends (1O).
 *
 * The body is the same plain text `NotificationTemplate.bodyMn` is written in —
 * `Нэр: утга` lines become a fact table, `- ` lines a list, a trailing URL a
 * button — because the office already writes that shape, and because a
 * marketing mail authored as raw HTML is a marketing mail that breaks in
 * Outlook a month later.
 */

/** What an author may write in a subject or a body, and what it fills with. */
export interface RecipientVars {
  /** Өөрийн нэр — what we greet them by. */
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
}

export const MARKETING_PLACEHOLDERS: { name: string; label: string }[] = [
  { name: '{{firstName}}', label: 'Нэр' },
  { name: '{{lastName}}', label: 'Овог' },
  { name: '{{fullName}}', label: 'Бүтэн нэр' },
  { name: '{{email}}', label: 'Имэйл хаяг' },
];

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Fills `{{firstName}}` and friends.
 *
 * An unknown placeholder is erased rather than left as `{{whatever}}`: what
 * reaches the recipient must never look like a broken mail-merge, and the
 * preview screen is where a typo is meant to be caught.
 */
export function personalise(text: string, vars: RecipientVars): string {
  return text.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = (vars as unknown as Record<string, string | undefined>)[key];
    return value ?? '';
  });
}

export function isEmailTone(value: string): value is EmailTone {
  return value in EMAIL_TONES;
}

export interface CampaignContent {
  subject: string;
  eyebrow?: string | null;
  heading?: string | null;
  bodyMn: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
  tone: string;
}

/**
 * @param unsubscribeUrl Absent only in the preview, where there is no real
 *        recipient to unsubscribe. Every actual send passes one.
 */
export function campaignMessage(
  campaign: CampaignContent,
  vars: RecipientVars,
  unsubscribeUrl?: string,
): EmailMessage {
  const fill = (value: string | null | undefined): string | undefined =>
    value ? personalise(value, vars) : undefined;

  const ctaUrl = campaign.ctaUrl?.trim();

  return {
    subject: personalise(campaign.subject, vars),
    eyebrow: fill(campaign.eyebrow),
    heading: fill(campaign.heading),
    tone: isEmailTone(campaign.tone) ? campaign.tone : 'info',
    body: personalise(campaign.bodyMn, vars),
    // `null` suppresses the button. Without it, `parseEmailBody` would promote
    // any URL left in the body — including one inside a sentence — into the
    // call to action, which is not the author's decision to lose.
    cta: ctaUrl ? { label: fill(campaign.ctaLabel) || 'Дэлгэрэнгүй харах', url: ctaUrl } : null,
    footerNote: fill(campaign.footerNote),
    unsubscribeUrl,
  };
}

/** Splits a stored name into the two halves the placeholders offer. */
export function varsFor(input: { email: string; name?: string | null }): RecipientVars {
  const full = (input.name ?? '').trim();
  // Mongolian order is овог → нэр, and the office writes it that way.
  const parts = full.split(/\s+/).filter(Boolean);
  const lastName = parts.length > 1 ? parts[0]! : '';
  const firstName = parts.length > 1 ? parts.slice(1).join(' ') : (parts[0] ?? '');

  return { firstName, lastName, fullName: full, email: input.email };
}
