import type {
  ClientStatus,
  EmailCampaignItem,
  LeadSource,
  LeadStage,
  MarketingAudience,
  MarketingFilters,
  MarketingTemplateItem,
  ServiceType,
} from '@gks/shared';

/**
 * The compose form's shape and payload (1O), shared by the "new campaign"
 * screen and the draft editor so the two can never disagree about what a
 * campaign is.
 *
 * The filters are held as flat arrays rather than the nested `filters` object
 * the API takes, because a checkbox group binds to an array and nothing else.
 */

export interface CampaignForm {
  name: string;
  templateId: string;

  subject: string;
  eyebrow: string;
  heading: string;
  bodyMn: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
  tone: string;

  audience: MarketingAudience;
  leadStages: LeadStage[];
  leadSources: LeadSource[];
  clientStatuses: ClientStatus[];
  serviceTypes: ServiceType[];
  tags: string;
  createdFrom: string;
  createdTo: string;
  /** One address per line — what a person pastes out of a spreadsheet. */
  emails: string;
}

export function emptyCampaignForm(): CampaignForm {
  return {
    name: '', templateId: '',
    subject: '', eyebrow: '', heading: '', bodyMn: '', ctaLabel: '', ctaUrl: '', footerNote: '',
    tone: 'info',
    // The safest default: the people who asked to hear from us.
    audience: 'SUBSCRIBERS',
    leadStages: [], leadSources: [], clientStatuses: [], serviceTypes: [],
    tags: '', createdFrom: '', createdTo: '', emails: '',
  };
}

export function formFromCampaign(campaign: EmailCampaignItem): CampaignForm {
  const filters = campaign.filters ?? {};
  return {
    name: campaign.name,
    templateId: campaign.templateId ?? '',
    subject: campaign.subject,
    eyebrow: campaign.eyebrow ?? '',
    heading: campaign.heading ?? '',
    bodyMn: campaign.bodyMn,
    ctaLabel: campaign.ctaLabel ?? '',
    ctaUrl: campaign.ctaUrl ?? '',
    footerNote: campaign.footerNote ?? '',
    tone: campaign.tone,
    audience: campaign.audience,
    leadStages: filters.leadStages ?? [],
    leadSources: filters.leadSources ?? [],
    clientStatuses: filters.clientStatuses ?? [],
    serviceTypes: filters.serviceTypes ?? [],
    tags: (filters.tags ?? []).join(', '),
    createdFrom: filters.createdFrom?.slice(0, 10) ?? '',
    createdTo: filters.createdTo?.slice(0, 10) ?? '',
    emails: (filters.emails ?? []).join('\n'),
  };
}

/** Fills the content half from a template; the audience is the author's choice. */
export function applyTemplate(form: CampaignForm, template: MarketingTemplateItem): CampaignForm {
  return {
    ...form,
    templateId: template.id,
    name: form.name || template.name,
    subject: template.subject,
    eyebrow: template.eyebrow ?? '',
    heading: template.heading ?? '',
    bodyMn: template.bodyMn,
    ctaLabel: template.ctaLabel ?? '',
    ctaUrl: template.ctaUrl ?? '',
    footerNote: template.footerNote ?? '',
    tone: template.tone,
  };
}

/**
 * Only the filters that belong to the chosen audience are sent.
 *
 * A lead-stage tick left over from a previous choice must not travel with a
 * client campaign: it would be ignored by the API, but it would also be shown
 * back on the draft as if it were narrowing something.
 */
export function filtersFromForm(form: CampaignForm): MarketingFilters {
  const common: MarketingFilters = {
    ...(form.createdFrom ? { createdFrom: form.createdFrom } : {}),
    ...(form.createdTo ? { createdTo: form.createdTo } : {}),
  };

  switch (form.audience) {
    case 'LEADS':
      return {
        ...common,
        ...(form.leadStages.length ? { leadStages: form.leadStages } : {}),
        ...(form.leadSources.length ? { leadSources: form.leadSources } : {}),
      };
    case 'CLIENTS':
    case 'CONTRACT_CLIENTS':
      return {
        ...common,
        ...(form.clientStatuses.length ? { clientStatuses: form.clientStatuses } : {}),
        ...(form.serviceTypes.length ? { serviceTypes: form.serviceTypes } : {}),
      };
    case 'SUBSCRIBERS':
      return { ...common, ...(splitTags(form.tags).length ? { tags: splitTags(form.tags) } : {}) };
    case 'CUSTOM':
      return { emails: splitEmails(form.emails) };
  }
}

export function campaignPayload(form: CampaignForm) {
  return {
    name: form.name.trim(),
    templateId: form.templateId || undefined,
    subject: form.subject.trim(),
    eyebrow: form.eyebrow.trim() || undefined,
    heading: form.heading.trim() || undefined,
    bodyMn: form.bodyMn,
    ctaLabel: form.ctaLabel.trim() || undefined,
    ctaUrl: form.ctaUrl.trim() || undefined,
    footerNote: form.footerNote.trim() || undefined,
    tone: form.tone,
    audience: form.audience,
    filters: filtersFromForm(form),
  };
}

export function validateCampaign(form: CampaignForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Нэр шаардлагатай';
  if (!form.subject.trim()) errors.subject = 'Гарчиг шаардлагатай';
  if (!form.bodyMn.trim()) errors.bodyMn = 'Агуулга шаардлагатай';
  if (form.ctaLabel.trim() && !form.ctaUrl.trim()) errors.ctaUrl = 'Товч дарахад очих холбоосыг бичнэ үү';
  if (form.audience === 'CUSTOM' && !splitEmails(form.emails).length) {
    errors.emails = 'Дор хаяж нэг имэйл хаяг оруулна уу';
  }
  return errors;
}

export function splitTags(value: string): string[] {
  return value.split(',').map((tag) => tag.trim()).filter(Boolean);
}

/** Accepts a pasted column, a comma list, or both — the office does all three. */
export function splitEmails(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes('@'));
}
