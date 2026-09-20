import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { paginate } from '../../common/dto/pagination.dto.js';
import {
  CampaignRecipientStatus,
  EmailCampaignStatus,
  MarketingAudience,
  type EmailCampaign,
  type Prisma,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MARKETING_QUEUE, MARKETING_SEND_JOB } from '../../queue/queue.constants.js';
import { renderEmail } from '../notifications/email/email-template.js';
import { AuditService } from '../audit/audit.service.js';
import { BrevoService } from './brevo.service.js';
import { MarketingAudienceService, type MarketingFilters } from './marketing-audience.service.js';
import { campaignMessage, varsFor, type CampaignContent } from './marketing-email.js';
import { MarketingTemplatesService } from './marketing-templates.service.js';
import { SubscribersService } from './subscribers.service.js';

export interface CampaignInput {
  name: string;
  templateId?: string | null;
  subject: string;
  eyebrow?: string | null;
  heading?: string | null;
  bodyMn: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
  tone?: string;
  audience: MarketingAudience;
  filters?: MarketingFilters;
}

/** Content is frozen once the recipients are; after that only the run may write. */
const EDITABLE: EmailCampaignStatus[] = [EmailCampaignStatus.DRAFT];

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audience: MarketingAudienceService,
    private readonly templates: MarketingTemplatesService,
    private readonly subscribers: SubscribersService,
    private readonly brevo: BrevoService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @InjectQueue(MARKETING_QUEUE) private readonly queue: Queue,
  ) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────

  async create(input: CampaignInput, actorId?: string) {
    // Named a template but wrote nothing? Take the template's wording. The
    // campaign *copies* it — a template edited next month must not rewrite
    // what went out today, the same rule `Notification` follows.
    const base = input.templateId ? await this.templates.findOne(input.templateId) : null;

    return this.prisma.emailCampaign.create({
      data: {
        name: input.name,
        templateId: input.templateId ?? null,
        subject: input.subject || base?.subject || '',
        eyebrow: input.eyebrow ?? base?.eyebrow ?? null,
        heading: input.heading ?? base?.heading ?? null,
        bodyMn: input.bodyMn || base?.bodyMn || '',
        ctaLabel: input.ctaLabel ?? base?.ctaLabel ?? null,
        ctaUrl: input.ctaUrl ?? base?.ctaUrl ?? null,
        footerNote: input.footerNote ?? base?.footerNote ?? null,
        tone: input.tone ?? base?.tone ?? 'info',
        audience: input.audience,
        filters: (input.filters ?? {}) as Prisma.InputJsonValue,
        createdById: actorId ?? null,
      },
    });
  }

  async list(query: { page: number; limit: number; skip: number; status?: EmailCampaignStatus }) {
    const where: Prisma.EmailCampaignWhereInput = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { createdBy: { select: { name: true, email: true } } },
      }),
      this.prisma.emailCampaign.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true, email: true } },
        template: { select: { id: true, name: true } },
      },
    });
    if (!campaign) throw new NotFoundException('Кампанит ажил олдсонгүй');
    return campaign;
  }

  async update(id: string, patch: Partial<CampaignInput>) {
    const campaign = await this.findOne(id);
    this.assertEditable(campaign);

    const { filters, templateId, ...rest } = patch;

    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...rest,
        ...(templateId === undefined ? {} : { templateId }),
        ...(filters ? { filters: filters as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    const campaign = await this.findOne(id);
    // A sent campaign is the record of what the company said to whom; only a
    // draft can be thrown away.
    if (campaign.status !== EmailCampaignStatus.DRAFT) {
      throw new BadRequestException('Зөвхөн ноорог кампанит ажлыг устгана');
    }
    await this.prisma.emailCampaign.delete({ where: { id } });
  }

  // ── Preview and test ─────────────────────────────────────────────────────

  /** The rendered HTML the compose screen shows in its iframe. */
  async preview(id: string): Promise<{ html: string; text: string; subject: string }> {
    const campaign = await this.findOne(id);
    const vars = varsFor({ email: 'zochin@example.mn', name: 'Батбаярын Тэмүүлэн' });
    const message = campaignMessage(campaign as CampaignContent, vars, this.subscribers.unsubscribeUrl('zochin@example.mn'));
    const appUrl = this.config.get<string>('notifications.appUrl') ?? 'https://gksedu.mn';
    const rendered = renderEmail(message, appUrl);

    return { ...rendered, subject: message.subject };
  }

  /**
   * Sends the campaign to one address, usually the admin's own.
   *
   * This is the only way to see what a client will see — a preview iframe
   * cannot tell you that Outlook ate the button or that the subject line is
   * cut off on a phone. It does not touch the campaign's counters.
   */
  async sendTest(id: string, email: string, name?: string | null): Promise<void> {
    const campaign = await this.findOne(id);
    const vars = varsFor({ email, name: name ?? 'Тест Хэрэглэгч' });
    const message = campaignMessage(
      campaign as CampaignContent,
      vars,
      this.subscribers.unsubscribeUrl(email),
    );
    message.subject = `[ТЕСТ] ${message.subject}`;

    await this.brevo.send({ email, name }, message, { tag: 'campaign_test' });
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  /**
   * Freezes the audience into recipient rows and queues the run.
   *
   * The rows are written *before* anything is sent, which is what makes the
   * whole thing resumable: after a crash, a deploy or a Redis blip the worker's
   * state is simply "which rows are still PENDING", and the unique
   * `(campaignId, email)` index means a re-queue can never mail anybody twice.
   */
  async queueSend(id: string, actorId?: string): Promise<{ total: number }> {
    const campaign = await this.findOne(id);
    if (campaign.status !== EmailCampaignStatus.DRAFT) {
      throw new BadRequestException('Энэ кампанит ажил аль хэдийн илгээгдсэн байна');
    }
    if (!campaign.subject.trim() || !campaign.bodyMn.trim()) {
      throw new BadRequestException('Гарчиг болон агуулга хоосон байна');
    }

    const recipients = await this.audience.resolve(
      campaign.audience,
      (campaign.filters ?? {}) as MarketingFilters,
    );
    if (!recipients.length) {
      throw new BadRequestException('Энэ сонголтод тохирох хүлээн авагч алга');
    }

    await this.prisma.emailCampaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        campaignId: id,
        email: recipient.email,
        name: recipient.name,
        clientId: recipient.clientId ?? null,
        leadId: recipient.leadId ?? null,
        subscriberId: recipient.subscriberId ?? null,
      })),
      skipDuplicates: true,
    });

    await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: EmailCampaignStatus.QUEUED,
        totalCount: recipients.length,
        sentCount: 0,
        failedCount: 0,
        skippedCount: 0,
        failReason: null,
      },
    });

    await this.audit.record({
      actorId,
      action: 'marketing.campaign.send',
      entity: 'EmailCampaign',
      entityId: id,
      after: { name: campaign.name, audience: campaign.audience, total: recipients.length },
    });

    await this.enqueue(id);
    return { total: recipients.length };
  }

  /** Adds (or re-adds) the run job. `jobId` keyed on the campaign — never two runs of one campaign. */
  async enqueue(campaignId: string, delay = 0): Promise<void> {
    await this.queue.add(
      MARKETING_SEND_JOB,
      { campaignId },
      { jobId: `${MARKETING_SEND_JOB}:${campaignId}:${Date.now()}`, delay, removeOnComplete: true },
    );
  }

  /**
   * Stops a run. What is already gone is gone — this only spares the rows that
   * have not been mailed yet, which is exactly what the person pressing the
   * button wants when they spot a typo halfway through.
   */
  async cancel(id: string, actorId?: string) {
    const campaign = await this.findOne(id);
    if (campaign.status === EmailCampaignStatus.SENT || campaign.status === EmailCampaignStatus.CANCELLED) {
      throw new BadRequestException('Энэ кампанит ажлыг зогсоох боломжгүй');
    }

    const { count } = await this.prisma.emailCampaignRecipient.updateMany({
      where: { campaignId: id, status: CampaignRecipientStatus.PENDING },
      data: { status: CampaignRecipientStatus.SKIPPED, error: 'Илгээхийг зогсоосон' },
    });

    await this.audit.record({
      actorId,
      action: 'marketing.campaign.cancel',
      entity: 'EmailCampaign',
      entityId: id,
      after: { skipped: count },
    });

    return this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: EmailCampaignStatus.CANCELLED,
        skippedCount: { increment: count },
        finishedAt: new Date(),
      },
    });
  }

  async recipients(
    id: string,
    query: { page: number; limit: number; skip: number; status?: CampaignRecipientStatus },
  ) {
    const where: Prisma.EmailCampaignRecipientWhereInput = {
      campaignId: id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.emailCampaignRecipient.findMany({
        where,
        orderBy: [{ status: 'asc' }, { email: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.emailCampaignRecipient.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /**
   * One batch of the run, called by the processor.
   *
   * @returns whether anything is still pending, i.e. whether to come back.
   */
  async sendBatch(campaignId: string): Promise<{ done: boolean; sent: number; failed: number }> {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return { done: true, sent: 0, failed: 0 };
    if (campaign.status === EmailCampaignStatus.CANCELLED) return { done: true, sent: 0, failed: 0 };

    if (campaign.status === EmailCampaignStatus.QUEUED) {
      await this.prisma.emailCampaign.update({
        where: { id: campaignId },
        data: { status: EmailCampaignStatus.SENDING, startedAt: campaign.startedAt ?? new Date() },
      });
    }

    const batchSize = this.config.get<number>('brevo.batchSize') ?? 50;
    const pending = await this.prisma.emailCampaignRecipient.findMany({
      where: { campaignId, status: CampaignRecipientStatus.PENDING },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
    });

    if (!pending.length) {
      await this.finish(campaign);
      return { done: true, sent: 0, failed: 0 };
    }

    let sent = 0;
    let failed = 0;

    // Sequential, not `Promise.all`: a campaign is not in a hurry, and a burst
    // of parallel sends is how a provider's rate limit turns into a wall of
    // failed recipients that then look like bad addresses.
    for (const recipient of pending) {
      try {
        const message = campaignMessage(
          campaign as CampaignContent,
          varsFor(recipient),
          this.subscribers.unsubscribeUrl(recipient.email),
        );
        const result = await this.brevo.send({ email: recipient.email, name: recipient.name }, message, {
          unsubscribeUrl: this.subscribers.unsubscribeUrl(recipient.email),
          tag: `campaign_${campaign.audience.toLowerCase()}`,
        });

        await this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: {
            status: CampaignRecipientStatus.SENT,
            sentAt: new Date(),
            providerMessageId: result.messageId,
            error: null,
          },
        });
        sent += 1;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await this.prisma.emailCampaignRecipient.update({
          where: { id: recipient.id },
          data: { status: CampaignRecipientStatus.FAILED, error: detail.slice(0, 500) },
        });
        failed += 1;
        this.logger.warn(`Кампанит имэйл амжилтгүй (${recipient.email}): ${detail}`);
      }
    }

    await this.prisma.emailCampaign.update({
      where: { id: campaignId },
      data: { sentCount: { increment: sent }, failedCount: { increment: failed } },
    });

    const remaining = await this.prisma.emailCampaignRecipient.count({
      where: { campaignId, status: CampaignRecipientStatus.PENDING },
    });

    if (!remaining) {
      await this.finish(await this.prisma.emailCampaign.findUniqueOrThrow({ where: { id: campaignId } }));
    }

    return { done: remaining === 0, sent, failed };
  }

  /**
   * A run where nothing at all got through is `FAILED`, not `SENT`: that is
   * almost always one cause — a rejected API key, an unverified sender — and
   * it must not be filed away as a delivered campaign.
   */
  private async finish(campaign: EmailCampaign): Promise<void> {
    if (campaign.status === EmailCampaignStatus.SENT || campaign.status === EmailCampaignStatus.CANCELLED) return;

    const counts = await this.prisma.emailCampaignRecipient.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: { _all: true },
    });
    const of = (status: CampaignRecipientStatus) =>
      counts.find((row) => row.status === status)?._count._all ?? 0;

    const sent = of(CampaignRecipientStatus.SENT);
    const failedOnly = sent === 0 && of(CampaignRecipientStatus.FAILED) > 0;

    await this.prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failedOnly ? EmailCampaignStatus.FAILED : EmailCampaignStatus.SENT,
        sentCount: sent,
        failedCount: of(CampaignRecipientStatus.FAILED),
        skippedCount: of(CampaignRecipientStatus.SKIPPED),
        finishedAt: new Date(),
      },
    });
  }

  private assertEditable(campaign: { status: EmailCampaignStatus }): void {
    if (!EDITABLE.includes(campaign.status)) {
      throw new BadRequestException('Илгээгдсэн кампанит ажлыг засах боломжгүй');
    }
  }
}
