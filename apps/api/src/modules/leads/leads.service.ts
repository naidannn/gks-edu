import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { STAFF_ROLES } from '../../common/constants/roles.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { LeadActivityType, LeadSource, LeadStage, Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AssignLeadDto, QueryLeadsDto } from './dto/query-leads.dto.js';
import type { CreateLeadActivityDto } from './dto/create-lead-activity.dto.js';
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
} satisfies Prisma.LeadSelect;

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Consultation request from the public website (1A-15).
   *
   * Bots are answered with a plausible-looking result and nothing is written —
   * telling a spammer their submission failed only invites a retry.
   */
  async createFromPublicForm(dto: CreatePublicLeadDto): Promise<PublicLeadResult> {
    if (dto.website) {
      this.logger.warn('Honeypot triggered on the public lead form; submission dropped');
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
      select: { id: true },
    });

    // 1A-17 will hang the staff notification off this point once the queue exists.
    return { id: lead.id, merged: false };
  }

  // ─── Staff CRM (1B-01) ────────────────────────────────────────────────────

  async findAllStaff(query: QueryLeadsDto) {
    const where = this.buildStaffWhere(query);

    const [items, total] = await this.prisma.$transaction([
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

    const [byStageRaw, total, unassigned, mineOpen, newLast7Days, recent] = await this.prisma.$transaction([
      this.prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } }),
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { assignedToId: null } }),
      this.prisma.lead.count({ where: { assignedToId: actorId, stage: { in: openStages } } }),
      this.prisma.lead.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.lead.findMany({
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
        activities: {
          orderBy: { occurredAt: 'desc' },
          take: 10,
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
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
      },
    });
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
    const [items, total] = await this.prisma.$transaction([
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
        where: { id: dto.assignedToId, role: { in: [...STAFF_ROLES] }, isActive: true },
        select: { id: true, name: true, email: true },
      });
      if (!assignee) throw new BadRequestException('Идэвхтэй ажилтан олдсонгүй');

      const [updated] = await this.prisma.$transaction([
        this.prisma.lead.update({ where: { id }, data: { assignedToId: assignee.id } }),
        this.prisma.leadActivity.create({
          data: {
            leadId: id,
            type: LeadActivityType.NOTE,
            body: `${assignee.name ?? assignee.email} ажилтанд оноогдлоо`,
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
        where: { role: { in: [...STAFF_ROLES] }, isActive: true },
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
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }

  private buildStaffWhere(query: QueryLeadsDto): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};

    if (query.q) {
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      where.OR = [{ firstName: contains }, { lastName: contains }, { email: contains }, { phone: { contains: query.q } }];
    }
    if (query.stage) where.stage = query.stage;
    if (query.source) where.source = query.source;
    if (query.assignedToId === 'unassigned') where.assignedToId = null;
    else if (query.assignedToId) where.assignedToId = query.assignedToId;
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }

    return where;
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
