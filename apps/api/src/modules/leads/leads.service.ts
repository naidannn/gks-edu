import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { STAFF_ROLES, activeStaffWhere } from '../../common/constants/roles.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { LeadActivityType, LeadSource, LeadStage, NotificationEvent, Prisma, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EmailService } from '../notifications/email.service.js';
import { leadReceivedEmail } from '../notifications/email/transactional.js';
import { LEAD_SOURCE_LABELS, SERVICE_TYPE_LABELS } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import { MetaEventsService } from '../meta/meta-events.service.js';
import { officeDateRange } from '../reports/report-period.js';
import type { MetaRequestContext } from '../meta/request-context.js';
import type { AssignLeadDto, QueryLeadsDto } from './dto/query-leads.dto.js';
import type { CreateLeadActivityDto } from './dto/create-lead-activity.dto.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { CreatePublicLeadDto } from './dto/create-public-lead.dto.js';
import type { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import type { TransitionLeadDto } from './dto/transition-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

/** A second submission from the same number inside this window is the same person. */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface PublicLeadResult {
  id: string;
  /** True when the submission merged into a lead the visitor had already created. */
  merged: boolean;
}

/**
 * Sales-funnel graph (1B-02). `WON` and `LOST` are terminal, except a lost
 * lead can be reopened — re-engaging a "no" is normal in this business.
 */
export const LEAD_STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  [LeadStage.NEW]: [LeadStage.CONTACTED, LeadStage.LOST],
  [LeadStage.CONTACTED]: [LeadStage.CONSULTED, LeadStage.LOST],
  [LeadStage.CONSULTED]: [LeadStage.PROPOSAL_SENT, LeadStage.LOST],
  [LeadStage.PROPOSAL_SENT]: [LeadStage.CONTRACT_PENDING, LeadStage.LOST],
  [LeadStage.CONTRACT_PENDING]: [LeadStage.WON, LeadStage.LOST],
  [LeadStage.WON]: [],
  [LeadStage.LOST]: [LeadStage.CONTACTED],
};

const STAFF_LIST_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  email: true,
  source: true,
  stage: true,
  assignedToId: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  nextContactAt: true,
  winProbability: true,
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true, code: true } },
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
    private readonly slack: SlackService,
    private readonly meta: MetaEventsService,
  ) {}

  /**
   * Consultation request from the public website (1A-15).
   *
   * Bots are answered with a plausible-looking result and nothing is written —
   * telling a spammer their submission failed only invites a retry.
   */
  async createFromPublicForm(
    dto: CreatePublicLeadDto,
    request: MetaRequestContext = {},
  ): Promise<PublicLeadResult> {
    if (dto.website) {
      this.logger.warn('Нээлттэй сэжмийн формын honeypot ажиллаа — хүсэлтийг хассан');
      return { id: crypto.randomUUID(), merged: false };
    }

    const phone = normalizePhone(dto.phone);
    const universityIds = await this.resolveUniversityIds(dto.interestedUniversitySlugs);

    const recent = await this.prisma.lead.findFirst({
      where: { phone, createdAt: { gte: new Date(Date.now() - DEDUPE_WINDOW_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (recent) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: recent.id,
          type: LeadActivityType.NOTE,
          body: dto.note ?? 'Вебсайтаас давтан хүсэлт илгээсэн',
          meta: { channel: 'website_form', repeat: true } satisfies Prisma.InputJsonObject,
        },
      });
      // A second form inside the dedupe window means the visitor is still
      // waiting for a call — worth saying out loud, not just filing.
      await this.slack.notify({
        emoji: '🔁',
        title: 'Давтан зөвлөгөөний хүсэлт',
        fields: [
          { label: 'Нэр', value: `${dto.lastName ?? ''} ${dto.firstName ?? ''}`.trim() },
          { label: 'Утас', value: phone },
          { label: 'Тэмдэглэл', value: dto.note },
        ],
        link: { label: 'CRM дээр нээх', path: `/admin/leads/${recent.id}` },
      });

      // 1N-39 — the same person, so the same conversion. Passing the original
      // lead's id as the event id makes Meta collapse the repeat into the event
      // the first submission already reported, instead of counting a nervous
      // visitor twice and teaching the campaign to look for more of them.
      await this.reportLeadToMeta(dto, phone, recent.id, request, { deduped: true });
      return { id: recent.id, merged: true };
    }

    const lead = await this.prisma.lead.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email?.trim().toLowerCase(),
        age: dto.age,
        educationLevel: dto.educationLevel,
        gpa: dto.gpa,
        gpaScale: dto.gpaScale,
        koreanLevel: dto.koreanLevel,
        englishLevel: dto.englishLevel,
        interestedServices: dto.interestedServices ?? [],
        interestedUniversityIds: universityIds,
        interestedMajor: dto.interestedMajor,
        note: dto.note,
        source: LeadSource.WEBSITE,
        utm: dto.utm ? (dto.utm as Prisma.InputJsonObject) : Prisma.JsonNull,
        activities: {
          create: {
            type: LeadActivityType.NOTE,
            body: dto.note ?? 'Вебсайтын зөвлөгөөний хүсэлт',
            meta: { channel: 'website_form' } satisfies Prisma.InputJsonObject,
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        source: true,
        interestedServices: true,
      },
    });

    await this.notifyStaffOfNewLead(lead);
    await this.acknowledgeLead(lead);
    await this.reportLeadToMeta(dto, phone, lead.id, request);
    return { id: lead.id, merged: false };
  }

  /**
   * The `Lead` conversion (1A-38). Only the public form reports one: a
   * consultant typing up a walk-in (`createByStaff`) is a real lead but not an
   * *ad* conversion, and feeding those to Meta teaches the campaign to find
   * people who were never going to click an ad.
   *
   * The event id comes from the browser, which fired its own `Lead` on the
   * same submission — Meta collapses the pair into one conversion. When the
   * pixel was blocked and no id arrived, the lead's own id is used: still
   * stable, still deduplicated against a retry of the same request.
   *
   * `deduped` is the repeat-submission case (1N-39): the browser's id is new
   * every time somebody presses the button again, so it is dropped in favour of
   * the original lead's id — the same id the first submission reported under,
   * which is what makes Meta count one person once.
   */
  private async reportLeadToMeta(
    dto: CreatePublicLeadDto,
    phone: string,
    leadId: string,
    request: MetaRequestContext,
    options: { deduped?: boolean } = {},
  ): Promise<void> {
    await this.meta.track({
      eventName: 'Lead',
      // A repeat submission ignores the browser's fresh event id: that id is
      // new on every submit, so it would deduplicate against nothing.
      eventId: options.deduped ? leadId : dto.tracking?.eventId || leadId,
      actionSource: 'website',
      eventSourceUrl: dto.tracking?.eventSourceUrl ?? dto.utm?.landingPage,
      identity: {
        email: dto.email,
        phone,
        firstName: dto.firstName,
        lastName: dto.lastName,
        country: 'mn',
        externalIds: [leadId, dto.tracking?.externalId],
        fbp: dto.tracking?.fbp,
        fbc: dto.tracking?.fbc,
        ...request,
      },
      customData: {
        content_category: 'consultation',
        content_name: dto.interestedServices?.join(', ') || 'Зөвлөгөө',
        ...(dto.interestedUniversitySlugs?.length ? { content_ids: dto.interestedUniversitySlugs } : {}),
      },
    });
  }

  /**
   * 1A-17 — every consultant hears about a new enquiry. There is no assignee
   * yet at this point (round-robin runs later), so the whole desk is notified;
   * that is also what the office asked for: first to call, wins.
   */
  private async notifyStaffOfNewLead(lead: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    source: LeadSource;
    interestedServices: ServiceType[];
  }): Promise<void> {
    await this.slack.notify({
      emoji: '🔔',
      title: 'Шинэ зөвлөгөөний хүсэлт',
      fields: [
        { label: 'Нэр', value: `${lead.lastName} ${lead.firstName}`.trim() },
        { label: 'Утас', value: lead.phone },
        { label: 'И-мэйл', value: lead.email },
        { label: 'Эх сурвалж', value: LEAD_SOURCE_LABELS[lead.source] },
        {
          label: 'Сонирхсон үйлчилгээ',
          value: lead.interestedServices.map((service) => SERVICE_TYPE_LABELS[service]).join(', '),
        },
      ],
      link: { label: 'CRM дээр нээх', path: `/admin/leads/${lead.id}` },
    });

    const staff = await this.prisma.user.findMany({
      where: activeStaffWhere(STAFF_ROLES),
      select: { id: true },
    });
    if (!staff.length) return;

    await this.notifications.dispatch({
      event: NotificationEvent.LEAD_CREATED,
      userIds: staff.map((member) => member.id),
      leadId: lead.id,
      context: {
        leadId: lead.id,
        leadName: `${lead.lastName} ${lead.firstName}`.trim(),
        leadPhone: lead.phone,
        leadEmail: lead.email,
        sourceName: LEAD_SOURCE_LABELS[lead.source],
        interestedServices:
          lead.interestedServices.map((service) => SERVICE_TYPE_LABELS[service]).join(', ') || 'Тодорхойгүй',
      },
    });
  }

  /**
   * The enquirer's own receipt. A lead has no `User` row yet, so this cannot go
   * through the dispatcher — it is a direct send to the address on the form,
   * and it is the only mail that person will get until they have an account.
   */
  private async acknowledgeLead(lead: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    interestedServices: ServiceType[];
  }): Promise<void> {
    if (!lead.email) return;

    const services = lead.interestedServices.map((service) => SERVICE_TYPE_LABELS[service]);

    try {
      await this.email.send(
        lead.email,
        leadReceivedEmail({
          name: `${lead.lastName} ${lead.firstName}`.trim(),
          phone: lead.phone,
          email: lead.email,
          services,
          universitiesUrl: this.email.link('/universities'),
        }),
        'lead_received',
      );
    } catch (error) {
      // A receipt is a courtesy; the lead is already saved and the desk notified.
      this.logger.warn(`Сэжимд баталгааны имэйл илгээгдсэнгүй: ${String(error)}`);
    }
  }

  // ─── Staff CRM (1B-01) ────────────────────────────────────────────────────

  /**
   * A consultant registering the person sitting in front of them (1B-19).
   *
   * Unlike the public form this is not an enquiry waiting to be answered — the
   * consultation is already happening — so the record opens at `CONSULTED`, the
   * desk is not paged about it, and no receipt is emailed to someone who was
   * just advised in person. What it does write is the first timeline entry, so
   * the visit itself is on the record and not only its outcome.
   *
   * Duplicates are not blocked here: the consultant is looking at the person
   * and the form warns them about matching numbers before they save. Anything
   * that slips through is what the merge tool is for (1B-09).
   */
  async createByStaff(dto: CreateLeadDto, actorId: string) {
    const phone = normalizePhone(dto.phone);
    const source = dto.source ?? LeadSource.OFFICE;
    const stage = dto.stage ?? LeadStage.CONSULTED;

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, ...activeStaffWhere(STAFF_ROLES) },
        select: { id: true },
      });
      if (!assignee) throw new BadRequestException('Идэвхтэй ажилтан олдсонгүй');
    }

    const universityIds = await this.existingUniversityIds(dto.interestedUniversityIds);

    const lead = await this.prisma.lead.create({
      data: {
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email?.trim().toLowerCase(),
        age: dto.age,
        educationLevel: dto.educationLevel,
        schoolName: dto.schoolName?.trim(),
        gpa: dto.gpa,
        gpaScale: dto.gpaScale?.trim(),
        koreanLevel: dto.koreanLevel?.trim(),
        englishLevel: dto.englishLevel?.trim(),
        interestedServices: dto.interestedServices ?? [],
        interestedUniversityIds: universityIds,
        interestedMajor: dto.interestedMajor?.trim(),
        note: dto.note?.trim(),
        source,
        stage,
        assignedToId: dto.assignedToId,
        nextContactAt: dto.nextContactAt ? new Date(dto.nextContactAt) : undefined,
        winProbability: dto.winProbability,
        activities: {
          create: {
            // An office visit is a meeting; a consultant typing up a phone call
            // or a referral is filing a note about one.
            type: source === LeadSource.OFFICE ? LeadActivityType.MEETING : LeadActivityType.NOTE,
            body: dto.note?.trim() || `${LEAD_SOURCE_LABELS[source]} — зөвлөгөө өгсөн`,
            meta: { channel: 'staff_intake', source, stage } satisfies Prisma.InputJsonObject,
            actorId,
          },
        },
      },
      select: { id: true },
    });

    return this.findOneStaff(lead.id);
  }

  async findAllStaff(query: QueryLeadsDto) {
    const where = this.buildStaffWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        select: STAFF_LIST_FIELDS,
        orderBy: { [query.sort]: query.order },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /** Dashboard counters for `/admin` (1B-08): funnel breakdown, workload, recent activity. */
  async stats(actorId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const openStages = Object.values(LeadStage).filter(
      (stage) => stage !== LeadStage.WON && stage !== LeadStage.LOST,
    );

    const [byStageRaw, total, unassigned, mineOpen, newLast7Days, recent] = await Promise.all([
      this.prisma.lead.groupBy({ by: ['stage'], where: { mergedIntoId: null }, _count: { _all: true } }),
      this.prisma.lead.count({ where: { mergedIntoId: null } }),
      this.prisma.lead.count({ where: { assignedToId: null, mergedIntoId: null } }),
      this.prisma.lead.count({ where: { assignedToId: actorId, stage: { in: openStages }, mergedIntoId: null } }),
      this.prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo }, mergedIntoId: null } }),
      this.prisma.lead.findMany({
        where: { mergedIntoId: null },
        select: STAFF_LIST_FIELDS,
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    const byStage = Object.fromEntries(Object.values(LeadStage).map((stage) => [stage, 0])) as Record<
      LeadStage,
      number
    >;
    for (const row of byStageRaw) byStage[row.stage] = row._count._all;

    return { total, byStage, unassigned, mineOpen, newLast7Days, recent };
  }

  async findOneStaff(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        // Present once the lead has been converted (1B-10) — the detail page
        // links to the client instead of offering the conversion again.
        client: { select: { id: true, code: true, createdAt: true } },
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!lead) throw new NotFoundException(`Сэжим ${id} олдсонгүй`);
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto) {
    await this.getOrThrow(id);

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.phone ? { phone: normalizePhone(dto.phone) } : {}),
        ...(dto.email ? { email: dto.email.trim().toLowerCase() } : {}),
        ...(dto.nextContactAt ? { nextContactAt: new Date(dto.nextContactAt) } : {}),
        ...(dto.interestedUniversityIds
          ? { interestedUniversityIds: await this.existingUniversityIds(dto.interestedUniversityIds) }
          : {}),
      },
    });
  }

  // ─── Duplicate detection and merge (1B-09) ────────────────────────────────

  /**
   * Leads that look like the same person as `id`: same normalised phone, or
   * same email. Name similarity is deliberately not used — Mongolian given
   * names repeat often enough that it would flag strangers as duplicates.
   */
  async findDuplicates(id: string) {
    const lead = await this.getOrThrow(id);

    const matches = await this.prisma.lead.findMany({
      where: {
        id: { not: id },
        mergedIntoId: null,
        OR: [{ phone: lead.phone }, ...(lead.email ? [{ email: lead.email }] : [])],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        stage: true,
        source: true,
        createdAt: true,
        assignedTo: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => ({
      ...match,
      matchedOn: [
        ...(match.phone === lead.phone ? ['phone'] : []),
        ...(lead.email && match.email === lead.email ? ['email'] : []),
      ],
    }));
  }

  /** Every open duplicate cluster, for the CRM's "давхардал" screen. */
  async duplicateClusters() {
    const rows = await this.prisma.lead.groupBy({
      by: ['phone'],
      where: { mergedIntoId: null },
      _count: { _all: true },
      having: { phone: { _count: { gt: 1 } } },
    });
    if (!rows.length) return [];

    const leads = await this.prisma.lead.findMany({
      where: { phone: { in: rows.map((row) => row.phone) }, mergedIntoId: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        stage: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const byPhone = new Map<string, typeof leads>();
    for (const lead of leads) {
      const bucket = byPhone.get(lead.phone) ?? [];
      bucket.push(lead);
      byPhone.set(lead.phone, bucket);
    }

    return [...byPhone.entries()].map(([phone, items]) => ({ phone, count: items.length, leads: items }));
  }

  /**
   * Folds `sourceId` into `targetId`. The source row is kept — a merged lead
   * still explains where a client came from — but it is marked and drops out
   * of every list, and its activities move to the surviving lead so the
   * timeline stays whole.
   *
   * Fields are only copied where the target is empty: the newest submission is
   * not automatically the most accurate, and the consultant chose the target.
   */
  async merge(targetId: string, sourceId: string, actorId: string) {
    if (targetId === sourceId) throw new BadRequestException('Сэжмийг өөрт нь нэгтгэх боломжгүй');

    const [target, source] = await Promise.all([this.getOrThrow(targetId), this.getOrThrow(sourceId)]);
    if (source.mergedIntoId) throw new BadRequestException('Энэ сэжим аль хэдийн нэгтгэгдсэн байна');
    if (target.mergedIntoId) throw new BadRequestException('Хүлээн авагч сэжим өөрөө нэгтгэгдсэн байна');

    // 1N-40 — merge and conversion have to know about each other. A converted
    // lead owns a client, a login and a signed history; folding it away marks
    // it LOST and hides it from every list, leaving a paying customer hanging
    // off a stub. The merge tool is for duplicates nobody has acted on yet, so
    // a converted lead on either side is refused and staff merge the records
    // the other way round — or not at all.
    await this.assertNotConverted(target.id, source.id);

    const fill: Prisma.LeadUpdateInput = {
      ...(target.email ? {} : { email: source.email }),
      ...(target.age ? {} : { age: source.age }),
      ...(target.educationLevel ? {} : { educationLevel: source.educationLevel }),
      ...(target.gpa ? {} : { gpa: source.gpa }),
      ...(target.koreanLevel ? {} : { koreanLevel: source.koreanLevel }),
      ...(target.englishLevel ? {} : { englishLevel: source.englishLevel }),
      ...(target.interestedMajor ? {} : { interestedMajor: source.interestedMajor }),
      ...(target.assignedToId ? {} : { assignedTo: source.assignedToId ? { connect: { id: source.assignedToId } } : undefined }),
      interestedServices: [...new Set([...target.interestedServices, ...source.interestedServices])],
      interestedUniversityIds: [...new Set([...target.interestedUniversityIds, ...source.interestedUniversityIds])],
      note: [target.note, source.note].filter(Boolean).join('\n---\n') || null,
    };

    return this.prisma.$transaction(async (tx) => {
      await tx.leadActivity.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });

      const merged = await tx.lead.update({ where: { id: targetId }, data: fill });

      await tx.lead.update({
        where: { id: sourceId },
        data: { mergedIntoId: targetId, mergedAt: new Date(), stage: LeadStage.LOST, lostReason: 'Давхардсан — нэгтгэсэн' },
      });

      await tx.leadActivity.create({
        data: {
          leadId: targetId,
          type: LeadActivityType.NOTE,
          body: `Давхардсан сэжим нэгтгэлээ (${source.lastName} ${source.firstName}, ${source.phone})`,
          meta: { mergedFromId: sourceId } satisfies Prisma.InputJsonObject,
          actorId,
        },
      });

      return merged;
    });
  }

  /** Refuses a merge that would hide, or rewrite, a lead already turned into a client. */
  private async assertNotConverted(targetId: string, sourceId: string): Promise<void> {
    const clients = await this.prisma.client.findMany({
      where: { leadId: { in: [targetId, sourceId] } },
      select: { code: true, leadId: true },
    });
    if (!clients.length) return;

    const onSource = clients.find((client) => client.leadId === sourceId);
    throw new ConflictException(
      onSource
        ? `Энэ сэжим ${onSource.code} үйлчлүүлэгч болсон тул нэгтгэх боломжгүй`
        : `Хүлээн авагч сэжим ${clients[0]!.code} үйлчлүүлэгч болсон тул нэгтгэх боломжгүй`,
    );
  }

  // ─── Stage transitions (1B-02) ────────────────────────────────────────────

  async transition(id: string, dto: TransitionLeadDto, actorId: string) {
    const lead = await this.getOrThrow(id);
    const allowed = LEAD_STAGE_TRANSITIONS[lead.stage];

    if (!allowed.includes(dto.stage)) {
      throw new BadRequestException(
        `${lead.stage} төлөвөөс ${dto.stage} рүү шилжих боломжгүй (зөвшөөрөгдсөн: ${allowed.join(', ') || '—'})`,
      );
    }
    if (dto.stage === LeadStage.LOST && !dto.lostReason?.trim()) {
      throw new BadRequestException('LOST төлөвт шилжихэд шалтгаан бичих шаардлагатай');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id },
        data: {
          stage: dto.stage,
          lostReason: dto.stage === LeadStage.LOST ? dto.lostReason!.trim() : null,
        },
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          type: LeadActivityType.STAGE_CHANGE,
          body: `${lead.stage} → ${dto.stage}`,
          meta: {
            from: lead.stage,
            to: dto.stage,
            ...(dto.lostReason ? { lostReason: dto.lostReason.trim() } : {}),
          } satisfies Prisma.InputJsonObject,
          actorId,
        },
      }),
    ]);

    return updated;
  }

  // ─── Activity timeline (1B-03) ────────────────────────────────────────────

  async listActivities(leadId: string, query: PaginationQueryDto) {
    await this.getOrThrow(leadId);

    const where = { leadId } satisfies Prisma.LeadActivityWhereInput;
    const [items, total] = await Promise.all([
      this.prisma.leadActivity.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: { actor: { select: { id: true, name: true } } },
      }),
      this.prisma.leadActivity.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async addActivity(leadId: string, dto: CreateLeadActivityDto, actorId: string) {
    await this.getOrThrow(leadId);
    if (dto.type === LeadActivityType.STAGE_CHANGE) {
      throw new BadRequestException('STAGE_CHANGE тэмдэглэлийг зөвхөн систем үүсгэнэ — /transitions ашиглана уу');
    }

    return this.prisma.leadActivity.create({
      data: {
        leadId,
        type: dto.type,
        body: dto.body,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
        meta: (dto.meta as Prisma.InputJsonObject | undefined) ?? {},
        actorId,
      },
      include: { actor: { select: { id: true, name: true } } },
    });
  }

  // ─── Assignment (1B-04) ───────────────────────────────────────────────────

  async assign(id: string, dto: AssignLeadDto, actorId: string) {
    await this.getOrThrow(id);

    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedToId, ...activeStaffWhere(STAFF_ROLES) },
        select: { id: true, name: true, email: true },
      });
      if (!assignee) throw new BadRequestException('Идэвхтэй ажилтан олдсонгүй');

      const [updated] = await this.prisma.$transaction([
        this.prisma.lead.update({ where: { id }, data: { assignedToId: assignee.id } }),
        this.prisma.leadActivity.create({
          data: {
            leadId: id,
            type: LeadActivityType.NOTE,
            body: `${assignee.name ?? assignee.email ?? 'Ажилтан'} ажилтанд оноогдлоо`,
            meta: { assignedToId: assignee.id } satisfies Prisma.InputJsonObject,
            actorId,
          },
        }),
      ]);
      return updated;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id }, data: { assignedToId: null } }),
      this.prisma.leadActivity.create({
        data: { leadId: id, type: LeadActivityType.NOTE, body: 'Хариуцагчгүй болголоо', actorId },
      }),
    ]);
    return updated;
  }

  /** Round-robin: whichever active staff member currently carries the fewest open leads. */
  async autoAssign(id: string, actorId: string) {
    const openStages = Object.values(LeadStage).filter(
      (stage) => stage !== LeadStage.WON && stage !== LeadStage.LOST,
    );

    const [staff, loads] = await Promise.all([
      this.prisma.user.findMany({
        where: activeStaffWhere(STAFF_ROLES),
        select: { id: true },
      }),
      this.prisma.lead.groupBy({
        by: ['assignedToId'],
        where: { assignedToId: { not: null }, stage: { in: openStages } },
        _count: { _all: true },
      }),
    ]);

    if (!staff.length) {
      throw new BadRequestException('Идэвхтэй ажилтан алга байна — гараар оноох боломжгүй');
    }

    const loadByUser = new Map(loads.map((row) => [row.assignedToId, row._count._all]));
    const [next] = staff.sort((a, b) => (loadByUser.get(a.id) ?? 0) - (loadByUser.get(b.id) ?? 0));

    return this.assign(id, { assignedToId: next!.id }, actorId);
  }

  private async getOrThrow(id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Сэжим ${id} олдсонгүй`);
    return lead;
  }

  private buildStaffWhere(query: QueryLeadsDto): Prisma.LeadWhereInput {
    // A lead folded into another (1B-09) stays in the database as history but
    // never appears in a working list again.
    const where: Prisma.LeadWhereInput = { mergedIntoId: null };

    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      where.OR = [{ firstName: contains }, { lastName: contains }, { email: contains }, { phone: { contains: query.q } }];
    }
    if (query.stage) where.stage = query.stage;
    if (query.source) where.source = query.source;
    if (query.assignedToId === 'unassigned') where.assignedToId = null;
    else if (query.assignedToId) where.assignedToId = query.assignedToId;
    // The same office-local window the reports use, so "энэ долоо хоног" means
    // one thing in the CRM list and in the report (1N-38).
    const createdAt = officeDateRange(query.createdFrom, query.createdTo);
    if (createdAt) where.createdAt = createdAt;

    return where;
  }

  /** Drops ids that no longer exist, so a stale pick cannot poison the record. */
  private async existingUniversityIds(ids?: string[]): Promise<string[]> {
    if (!ids?.length) return [];
    const rows = await this.prisma.university.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private async resolveUniversityIds(slugs?: string[]): Promise<string[]> {
    if (!slugs?.length) return [];
    const rows = await this.prisma.university.findMany({
      where: { slug: { in: slugs } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/** Store one canonical form so duplicate detection and search actually match. */
export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  return digits.startsWith('976') && digits.length > 8 ? digits.slice(3) : digits;
}
