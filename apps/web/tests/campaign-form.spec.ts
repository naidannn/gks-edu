import { describe, expect, it } from 'vitest';
import type { EmailCampaignItem, MarketingTemplateItem } from '@gks/shared';
import {
  applyTemplate,
  campaignPayload,
  emptyCampaignForm,
  filtersFromForm,
  formFromCampaign,
  splitEmails,
  splitTags,
  validateCampaign,
} from '../app/utils/campaign-form';

const TEMPLATE: MarketingTemplateItem = {
  id: 'tpl-1',
  key: 'gks-campaign',
  name: 'GKS тэтгэлгийн кампанит ажил',
  subject: 'GKS бүртгэл нээлттэй',
  eyebrow: 'GKS тэтгэлэг',
  heading: 'Сайн мэдээ',
  bodyMn: 'Сайн байна уу, {{firstName}}.',
  ctaLabel: 'Боломжоо шалгах',
  ctaUrl: 'https://gksedu.mn/gks-check',
  footerNote: null,
  tone: 'success',
  isActive: true,
  createdAt: '2026-09-21T00:00:00.000Z',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

describe('filtersFromForm', () => {
  it('sends only the filters the chosen audience uses', () => {
    // A stage ticked before the audience was switched must not travel with a
    // client campaign — the API would ignore it, but the draft would show it
    // back as if it were narrowing something.
    const form = {
      ...emptyCampaignForm(),
      audience: 'CLIENTS' as const,
      leadStages: ['NEW' as const],
      clientStatuses: ['ACTIVE' as const],
    };

    expect(filtersFromForm(form)).toEqual({ clientStatuses: ['ACTIVE'] });
  });

  it('keeps the date range on every audience but CUSTOM', () => {
    const base = { ...emptyCampaignForm(), createdFrom: '2026-01-01', createdTo: '2026-06-30' };

    expect(filtersFromForm({ ...base, audience: 'LEADS' })).toMatchObject({
      createdFrom: '2026-01-01',
      createdTo: '2026-06-30',
    });
    // A pasted list is the list; a date range over it means nothing.
    expect(filtersFromForm({ ...base, audience: 'CUSTOM', emails: 'a@b.mn' })).toEqual({
      emails: ['a@b.mn'],
    });
  });

  it('omits an empty selection rather than sending an empty array', () => {
    expect(filtersFromForm({ ...emptyCampaignForm(), audience: 'SUBSCRIBERS' })).toEqual({});
  });
});

describe('splitEmails', () => {
  it('takes a pasted column, a comma list, or both', () => {
    expect(splitEmails('a@b.mn\nc@d.mn, e@f.mn;g@h.mn')).toEqual([
      'a@b.mn',
      'c@d.mn',
      'e@f.mn',
      'g@h.mn',
    ]);
  });

  it('lower-cases and drops anything without an @', () => {
    expect(splitEmails('  A@B.MN \n утасгүй ')).toEqual(['a@b.mn']);
  });
});

describe('splitTags', () => {
  it('splits on commas and drops the blanks a trailing comma leaves', () => {
    expect(splitTags('gks2027, expo, ')).toEqual(['gks2027', 'expo']);
  });
});

describe('applyTemplate', () => {
  it('fills the content and leaves the audience alone', () => {
    const form = { ...emptyCampaignForm(), audience: 'LEADS' as const, leadStages: ['NEW' as const] };
    const filled = applyTemplate(form, TEMPLATE);

    expect(filled.subject).toBe(TEMPLATE.subject);
    expect(filled.tone).toBe('success');
    expect(filled.templateId).toBe('tpl-1');
    expect(filled.audience).toBe('LEADS');
    expect(filled.leadStages).toEqual(['NEW']);
  });

  it('does not overwrite a name the author already typed', () => {
    const named = applyTemplate({ ...emptyCampaignForm(), name: '9-р сарын илгээлт' }, TEMPLATE);
    expect(named.name).toBe('9-р сарын илгээлт');

    const unnamed = applyTemplate(emptyCampaignForm(), TEMPLATE);
    expect(unnamed.name).toBe(TEMPLATE.name);
  });
});

describe('formFromCampaign', () => {
  it('round-trips a draft back into the form', () => {
    const campaign = {
      id: 'c1',
      name: 'Сарын мэдээлэл',
      templateId: 'tpl-1',
      subject: 'Гарчиг',
      eyebrow: null,
      heading: null,
      bodyMn: 'Агуулга',
      ctaLabel: null,
      ctaUrl: null,
      footerNote: null,
      tone: 'info',
      audience: 'LEADS',
      filters: { leadStages: ['CONSULTED'], tags: ['a', 'b'], createdFrom: '2026-02-01T00:00:00.000Z' },
      status: 'DRAFT',
      totalCount: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      startedAt: null,
      finishedAt: null,
      failReason: null,
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    } as EmailCampaignItem;

    const form = formFromCampaign(campaign);
    expect(form.leadStages).toEqual(['CONSULTED']);
    expect(form.tags).toBe('a, b');
    // The date input wants `yyyy-mm-dd`, not the ISO instant the API returns.
    expect(form.createdFrom).toBe('2026-02-01');
  });
});

describe('validateCampaign', () => {
  it('requires a name, a subject and a body', () => {
    expect(Object.keys(validateCampaign(emptyCampaignForm())).sort()).toEqual([
      'bodyMn',
      'name',
      'subject',
    ]);
  });

  it('refuses a button with no destination', () => {
    const form = {
      ...emptyCampaignForm(),
      name: 'a', subject: 'b', bodyMn: 'c',
      ctaLabel: 'Дэлгэрэнгүй',
    };
    expect(validateCampaign(form).ctaUrl).toBeTruthy();
  });

  it('refuses a CUSTOM audience with no usable address', () => {
    const form = {
      ...emptyCampaignForm(),
      name: 'a', subject: 'b', bodyMn: 'c',
      audience: 'CUSTOM' as const,
      emails: 'утасгүй',
    };
    expect(validateCampaign(form).emails).toBeTruthy();
  });
});

describe('campaignPayload', () => {
  it('drops the empty optional fields instead of sending empty strings', () => {
    const payload = campaignPayload({
      ...emptyCampaignForm(),
      name: '  Сарын мэдээлэл  ',
      subject: 'Гарчиг',
      bodyMn: 'Агуулга',
    });

    expect(payload.name).toBe('Сарын мэдээлэл');
    expect(payload.eyebrow).toBeUndefined();
    expect(payload.ctaUrl).toBeUndefined();
    expect(payload.templateId).toBeUndefined();
  });
});
