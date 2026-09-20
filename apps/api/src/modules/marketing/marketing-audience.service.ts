import { Injectable } from '@nestjs/common';
import {
  ClientStatus,
  ContractStatus,
  LeadSource,
  LeadStage,
  MarketingAudience,
  ServiceType,
  SubscriberStatus,
  type Prisma,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normaliseEmail } from './unsubscribe-token.js';

/**
 * Who a campaign goes to (1O).
 *
 * An audience is a query over rows the CRM already holds, not a list somebody
 * maintains by hand — a mailing list kept beside the CRM is a mailing list that
 * is wrong within a month. The office picks a source and narrows it; the count
 * they see on the compose screen comes from this same code, so "1,240 хүн"
 * is the number that will actually be mailed.
 */

export interface MarketingFilters {
  /** LEADS */
  leadStages?: LeadStage[];
  leadSources?: LeadSource[];
  /** CLIENTS, CONTRACT_CLIENTS */
  clientStatuses?: ClientStatus[];
  serviceTypes?: ServiceType[];
  /** SUBSCRIBERS — any one of these tags. */
  tags?: string[];
  /** All audiences: when the record was created. ISO dates. */
  createdFrom?: string;
  createdTo?: string;
  /** CUSTOM */
  emails?: string[];
}

export interface AudienceRecipient {
  email: string;
  name: string | null;
  clientId?: string;
  leadId?: string;
  subscriberId?: string;
}

/** A contract that was actually concluded — a draft is not a customer. */
const CONCLUDED: ContractStatus[] = [
  ContractStatus.SIGNED,
  ContractStatus.ACTIVE,
  ContractStatus.COMPLETED,
];

@Injectable()
export class MarketingAudienceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the audience and removes everybody who may not be mailed.
   *
   * Deduplication is by address, not by record: the same person is very often
   * a `Lead` row *and* a `Client` row, and the pair is exactly the kind of
   * thing that makes a recipient unsubscribe. The first record to claim an
   * address keeps it, and the order below — client before lead — means the
   * stronger relationship is the one that gets attributed.
   */
  async resolve(
    audience: MarketingAudience,
    filters: MarketingFilters,
  ): Promise<AudienceRecipient[]> {
    const rows = await this.collect(audience, filters);

    const suppressed = await this.suppressedAddresses(rows.map((row) => row.email));
    const seen = new Set<string>();
    const recipients: AudienceRecipient[] = [];

    for (const row of rows) {
      const email = normaliseEmail(row.email);
      if (!isMailable(email) || suppressed.has(email) || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ ...row, email });
    }

    return recipients;
  }

  /** The compose screen's live count, plus a handful of addresses to eyeball. */
  async preview(
    audience: MarketingAudience,
    filters: MarketingFilters,
  ): Promise<{ total: number; sample: AudienceRecipient[] }> {
    const recipients = await this.resolve(audience, filters);
    return { total: recipients.length, sample: recipients.slice(0, 8) };
  }

  // ── Sources ──────────────────────────────────────────────────────────────

  private async collect(
    audience: MarketingAudience,
    filters: MarketingFilters,
  ): Promise<AudienceRecipient[]> {
    switch (audience) {
      case MarketingAudience.CONTRACT_CLIENTS:
        return this.clients(filters, true);
      case MarketingAudience.CLIENTS:
        return this.clients(filters, false);
      case MarketingAudience.LEADS:
        return this.leads(filters);
      case MarketingAudience.SUBSCRIBERS:
        return this.subscribers(filters);
      case MarketingAudience.CUSTOM:
        return (filters.emails ?? []).map((email) => ({ email, name: null }));
    }
  }

  private async clients(filters: MarketingFilters, withContract: boolean): Promise<AudienceRecipient[]> {
    const where: Prisma.ClientWhereInput = {
      ...(filters.clientStatuses?.length ? { status: { in: filters.clientStatuses } } : {}),
      ...(filters.serviceTypes?.length ? { primaryServiceType: { in: filters.serviceTypes } } : {}),
      ...dateRange(filters),
      ...(withContract ? { user: { contracts: { some: { status: { in: CONCLUDED } } } } } : {}),
    };

    const rows = await this.prisma.client.findMany({
      where,
      select: {
        id: true,
        email: true,
        lastName: true,
        firstName: true,
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows
      // The client row's own address is the one the office keeps current; the
      // account address is only a fallback, and for a staff-created client
      // who never claimed a login there may be no account address at all.
      .map((row) => ({
        email: row.email ?? row.user?.email ?? '',
        name: `${row.lastName} ${row.firstName}`.trim(),
        clientId: row.id,
      }))
      .filter((row) => Boolean(row.email));
  }

  private async leads(filters: MarketingFilters): Promise<AudienceRecipient[]> {
    const rows = await this.prisma.lead.findMany({
      where: {
        email: { not: null },
        // A lead that was merged into another one is history, not a person to
        // write to — mailing it would double up on whoever it merged into.
        mergedIntoId: null,
        // Somebody who signed is reached as a client, with their client name
        // and their client history; leaving them here would mail them twice
        // under two different relationships.
        client: null,
        ...(filters.leadStages?.length ? { stage: { in: filters.leadStages } } : {}),
        ...(filters.leadSources?.length ? { source: { in: filters.leadSources } } : {}),
        ...dateRange(filters),
      },
      select: { id: true, email: true, lastName: true, firstName: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      email: row.email!,
      name: `${row.lastName} ${row.firstName}`.trim(),
      leadId: row.id,
    }));
  }

  private async subscribers(filters: MarketingFilters): Promise<AudienceRecipient[]> {
    const rows = await this.prisma.emailSubscriber.findMany({
      where: {
        status: SubscriberStatus.SUBSCRIBED,
        ...(filters.tags?.length ? { tags: { hasSome: filters.tags } } : {}),
        ...dateRange(filters),
      },
      select: { id: true, email: true, name: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({ email: row.email, name: row.name, subscriberId: row.id }));
  }

  // ── Suppression ──────────────────────────────────────────────────────────

  /**
   * Addresses that must never be mailed again, whichever audience they turn
   * up in. `email_subscribers` is both the newsletter list and the suppression
   * list, so an unsubscribe from a client also silences the lead row that
   * shares their address.
   */
  private async suppressedAddresses(emails: string[]): Promise<Set<string>> {
    if (!emails.length) return new Set();

    const rows = await this.prisma.emailSubscriber.findMany({
      where: {
        email: { in: emails.map(normaliseEmail) },
        status: { in: [SubscriberStatus.UNSUBSCRIBED, SubscriberStatus.BOUNCED] },
      },
      select: { email: true },
    });

    return new Set(rows.map((row) => row.email));
  }
}

function dateRange(filters: MarketingFilters): { createdAt?: { gte?: Date; lte?: Date } } {
  const gte = filters.createdFrom ? new Date(filters.createdFrom) : undefined;
  const lte = filters.createdTo ? new Date(`${filters.createdTo.slice(0, 10)}T23:59:59.999Z`) : undefined;
  if (!gte && !lte) return {};
  return { createdAt: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } };
}

/** Deliberately loose — the point is to drop obvious junk, not to police addresses. */
export function isMailable(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
