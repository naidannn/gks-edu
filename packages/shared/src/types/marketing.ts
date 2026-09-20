/**
 * Marketing mail — 1O. Campaigns, templates, the newsletter list.
 *
 * As everywhere else here, the enums mirror the Prisma ones as string unions so
 * the web app never imports the generated Prisma client.
 */

import type { ClientStatus } from './client';
import type { LeadSource, LeadStage } from './lead-crm';
import type { ServiceType } from '../schemas/lead';

export type MarketingAudience = 'CONTRACT_CLIENTS' | 'CLIENTS' | 'LEADS' | 'SUBSCRIBERS' | 'CUSTOM';
export type EmailCampaignStatus = 'DRAFT' | 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED';
export type CampaignRecipientStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type SubscriberStatus = 'SUBSCRIBED' | 'UNSUBSCRIBED' | 'BOUNCED';
export type EmailTone = 'info' | 'success' | 'warning' | 'critical';

/** How an audience is narrowed. An empty field means "all of them". */
export interface MarketingFilters {
  leadStages?: LeadStage[];
  leadSources?: LeadSource[];
  clientStatuses?: ClientStatus[];
  serviceTypes?: ServiceType[];
  tags?: string[];
  createdFrom?: string;
  createdTo?: string;
  emails?: string[];
}

/** The content half of a campaign — shared by templates and campaigns. */
export interface MarketingContent {
  subject: string;
  eyebrow: string | null;
  heading: string | null;
  bodyMn: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  footerNote: string | null;
  tone: string;
}

export interface MarketingTemplateItem extends MarketingContent {
  id: string;
  name: string;
  /** Set only on the templates shipped with the code. */
  key: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignItem extends MarketingContent {
  id: string;
  name: string;
  templateId: string | null;
  audience: MarketingAudience;
  filters: MarketingFilters;
  status: EmailCampaignStatus;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  failReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { name: string | null; email: string | null } | null;
  template?: { id: string; name: string } | null;
}

export interface CampaignRecipientItem {
  id: string;
  email: string;
  name: string | null;
  clientId: string | null;
  leadId: string | null;
  subscriberId: string | null;
  status: CampaignRecipientStatus;
  error: string | null;
  sentAt: string | null;
}

export interface AudiencePreview {
  total: number;
  sample: { email: string; name: string | null }[];
}

export interface CampaignPreview {
  html: string;
  text: string;
  subject: string;
}

export interface EmailSubscriberItem {
  id: string;
  email: string;
  name: string | null;
  status: SubscriberStatus;
  source: string;
  tags: string[];
  brevoSyncedAt: string | null;
  unsubscribedAt: string | null;
  createdAt: string;
}

export interface SubscriberStats {
  subscribed: number;
  unsubscribed: number;
  bounced: number;
}
