import { describe, expect, it } from 'vitest';
import { renderEmail } from '../notifications/email/email-template.js';
import { isMailable } from './marketing-audience.service.js';
import { campaignMessage, personalise, varsFor, type CampaignContent } from './marketing-email.js';
import { normaliseEmail, signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.js';

const SECRET = 'test-secret-that-is-long-enough-for-hmac';
const APP_URL = 'https://gksedu.mn';

const CAMPAIGN: CampaignContent = {
  subject: '{{firstName}}, GKS тэтгэлгийн бүртгэл нээлттэй',
  eyebrow: 'GKS тэтгэлэг',
  heading: 'Сайн мэдээ',
  bodyMn: 'Сайн байна уу, {{firstName}}.\n\nБүртгэл нээлттэй байна.',
  ctaLabel: 'Боломжоо шалгах',
  ctaUrl: 'https://gksedu.mn/gks-check',
  footerNote: null,
  tone: 'success',
};

describe('unsubscribe token (1O)', () => {
  it('round-trips the address it was issued for', () => {
    const token = signUnsubscribeToken('Temuulen@Example.MN', SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe('temuulen@example.mn');
  });

  it('rejects a token whose payload was swapped for somebody else’s address', () => {
    const mine = signUnsubscribeToken('a@example.mn', SECRET);
    const theirs = Buffer.from('victim@example.mn', 'utf8').toString('base64url');
    const forged = `${theirs}.${mine.split('.')[1]}`;

    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken('a@example.mn', 'another-secret-entirely-long-enough');
    expect(verifyUnsubscribeToken(token, SECRET)).toBeNull();
  });

  it('survives a garbage token without throwing', () => {
    // `timingSafeEqual` throws on a length mismatch, so this is the case that
    // would turn a crawler hitting /unsubscribe into a 500.
    expect(verifyUnsubscribeToken('nonsense', SECRET)).toBeNull();
    expect(verifyUnsubscribeToken('a.b', SECRET)).toBeNull();
    expect(verifyUnsubscribeToken('', SECRET)).toBeNull();
  });
});

describe('personalisation', () => {
  it('splits a Mongolian овог-нэр into the two placeholders', () => {
    expect(varsFor({ email: 'a@b.mn', name: 'Батбаярын Тэмүүлэн' })).toEqual({
      lastName: 'Батбаярын',
      firstName: 'Тэмүүлэн',
      fullName: 'Батбаярын Тэмүүлэн',
      email: 'a@b.mn',
    });
  });

  it('treats a single word as the first name — a greeting must never be blank', () => {
    const vars = varsFor({ email: 'a@b.mn', name: 'Тэмүүлэн' });
    expect(vars.firstName).toBe('Тэмүүлэн');
    expect(vars.lastName).toBe('');
  });

  it('erases an unknown placeholder rather than showing the braces', () => {
    const vars = varsFor({ email: 'a@b.mn', name: 'Тэмүүлэн' });
    expect(personalise('Сайн уу, {{nickname}}.', vars)).toBe('Сайн уу, .');
  });
});

describe('campaignMessage', () => {
  const vars = varsFor({ email: 'temuulen@example.mn', name: 'Батбаярын Тэмүүлэн' });

  it('fills the subject and the body', () => {
    const message = campaignMessage(CAMPAIGN, vars);
    expect(message.subject).toBe('Тэмүүлэн, GKS тэтгэлгийн бүртгэл нээлттэй');
    expect(message.body).toContain('Сайн байна уу, Тэмүүлэн.');
  });

  it('suppresses the button when the campaign has no call to action', () => {
    // Without an explicit `null`, `parseEmailBody` would promote any URL left
    // in the prose into the button — a link the author never chose.
    const message = campaignMessage(
      { ...CAMPAIGN, ctaUrl: null, bodyMn: 'Дэлгэрэнгүй: https://gksedu.mn/blog/2026' },
      vars,
    );
    expect(message.cta).toBeNull();
  });

  it('puts the unsubscribe link in the HTML footer and in the text part', () => {
    const url = 'https://gksedu.mn/unsubscribe?token=abc';
    const { html, text } = renderEmail(campaignMessage(CAMPAIGN, vars, url), APP_URL);

    expect(html).toContain(url);
    expect(html).toContain('Захиалгаас гарах');
    expect(text).toContain(`Захиалгаас гарах: ${url}`);
  });

  it('leaves transactional mail without an unsubscribe line', () => {
    const { html, text } = renderEmail(campaignMessage(CAMPAIGN, vars), APP_URL);
    expect(html).toContain('Мэдэгдлийн тохиргоо');
    expect(text).not.toContain('Захиалгаас гарах');
  });
});

describe('address hygiene', () => {
  it('accepts a normal address and drops the shapes an office sheet leaks', () => {
    expect(isMailable('temuulen@example.mn')).toBe(true);
    expect(isMailable('утас байхгүй')).toBe(false);
    expect(isMailable('a@b')).toBe(false);
    expect(isMailable('')).toBe(false);
  });

  it('lower-cases and trims, because the suppression list is keyed on that', () => {
    expect(normaliseEmail('  Temuulen@Example.MN ')).toBe('temuulen@example.mn');
  });
});
