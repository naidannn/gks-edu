import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { NotificationEvent, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DAY_MS, formatDateMn } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateChecklistItemDto, UpdateChecklistItemDto, UpdateDeparturePlanDto } from './dto/departure.dto.js';

const PLAN_INCLUDE = {
  items: { orderBy: { sortOrder: 'asc' } },
  case: { select: { id: true, code: true, userId: true, university: { select: { id: true, nameMn: true, nameEn: true, cityMn: true } } } },
} satisfies Prisma.DeparturePlanInclude;

/**
 * 1F-06/1F-07 — everything between "виз гарлаа" and boarding (gksedu.md §11).
 * The checklist is cloned from `DepartureChecklistTemplate` rather than shared,
 * so a client's ticked items survive a later edit of the seed text.
 */
@Injectable()
export class DepartureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Idempotent — the visa approval calls this, and staff may call it early. */
  async ensurePlan(caseId: string) {
    const existing = await this.prisma.departurePlan.findUnique({ where: { caseId }, include: PLAN_INCLUDE });
    if (existing) return existing;

    // Only on the create path, so the common call stays one query. Without it
    // an unknown case surfaces the foreign-key violation as a 500 (1N-26).
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const templates = await this.prisma.departureChecklistTemplate.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    return this.prisma.departurePlan.create({
      data: {
        caseId,
        items: {
          create: templates.map((template) => ({
            templateCode: template.code,
            titleMn: template.titleMn,
            descriptionMn: template.descriptionMn,
            guideUrl: template.guideUrl,
            videoUrl: template.videoUrl,
            sortOrder: template.sortOrder,
          })),
        },
      },
      include: PLAN_INCLUDE,
    });
  }

  async findForCase(caseId: string, actor: AuthenticatedUser) {
    const plan = await this.prisma.departurePlan.findUnique({ where: { caseId }, include: PLAN_INCLUDE });
    if (!plan) return null;
    this.assertAccess(plan.case.userId, actor);
    return { ...plan, progress: progressOf(plan.items) };
  }

  /**
   * Setting the departure date re-dates the checklist: each item seeded with an
   * `offsetDays` becomes due that many days before the flight (§11).
   */
  async updatePlan(caseId: string, dto: UpdateDeparturePlanDto, actor: AuthenticatedUser) {
    const plan = await this.getOrThrow(caseId);
    this.assertAccess(plan.case.userId, actor);

    const departureAt = dto.departureAt ? new Date(dto.departureAt) : undefined;
    const updated = await this.prisma.departurePlan.update({
      where: { caseId },
      data: {
        departureAt,
        flightNo: dto.flightNo,
        arrivalAt: dto.arrivalAt ? new Date(dto.arrivalAt) : undefined,
        pickupRequested: dto.pickupRequested,
        dormitoryInfo: dto.dormitoryInfo,
        emergencyNote: dto.emergencyNote,
        note: dto.note,
      },
      include: PLAN_INCLUDE,
    });

    if (departureAt) await this.redateChecklist(updated.id, departureAt);

    // §16 "Онгоцны билетийн мэдээлэл шинэчлэгдсэн" — only when the flight
    // itself moved; editing a dormitory note is not news to the client. And
    // never to the person who just typed it: telling a client about their own
    // edit is noise, not news (1N-26).
    if ((departureAt || dto.flightNo || dto.arrivalAt) && actor.id !== updated.case.userId) {
      await this.notifications.dispatch({
        event: NotificationEvent.FLIGHT_INFO_UPDATED,
        userIds: [updated.case.userId],
        caseId,
        context: {
          caseId,
          caseCode: updated.case.code,
          flightNumber: updated.flightNo,
          departureDate: formatDateMn(updated.departureAt),
          arrivalDate: formatDateMn(updated.arrivalAt),
        },
      });
    }

    return this.findForCase(caseId, actor);
  }

  async addItem(caseId: string, dto: CreateChecklistItemDto, actor: AuthenticatedUser) {
    const plan = await this.getOrThrow(caseId);
    this.assertAccess(plan.case.userId, actor);

    return this.prisma.departureChecklistItem.create({
      data: {
        planId: plan.id,
        titleMn: dto.titleMn,
        descriptionMn: dto.descriptionMn,
        guideUrl: dto.guideUrl,
        videoUrl: dto.videoUrl,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        sortOrder: dto.sortOrder ?? 900,
      },
    });
  }

  async updateItem(itemId: string, dto: UpdateChecklistItemDto, actor: AuthenticatedUser) {
    const item = await this.prisma.departureChecklistItem.findUnique({
      where: { id: itemId },
      include: { plan: { select: { case: { select: { userId: true } } } } },
    });
    if (!item) throw new NotFoundException(`Чеклистийн зүйл ${itemId} олдсонгүй`);
    this.assertAccess(item.plan.case.userId, actor);

    return this.prisma.departureChecklistItem.update({
      where: { id: itemId },
      data: {
        isDone: dto.isDone,
        doneAt: dto.isDone === undefined ? undefined : dto.isDone ? new Date() : null,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        descriptionMn: dto.descriptionMn,
      },
    });
  }

  private async redateChecklist(planId: string, departureAt: Date): Promise<void> {
    const items = await this.prisma.departureChecklistItem.findMany({
      where: { planId, templateCode: { not: null } },
      include: { template: { select: { offsetDays: true } } },
    });

    // Items sharing an offset share a date, so a dozen seeded rows become two
    // or three statements instead of a dozen round trips to a database 115 ms
    // away — and the checklist is re-dated all at once or not at all.
    const byOffset = new Map<number, string[]>();
    for (const item of items) {
      const offset = item.template?.offsetDays;
      if (offset === null || offset === undefined) continue;
      const ids = byOffset.get(offset);
      if (ids) ids.push(item.id);
      else byOffset.set(offset, [item.id]);
    }
    if (!byOffset.size) return;

    await this.prisma.$transaction(
      [...byOffset.entries()].map(([offset, ids]) =>
        this.prisma.departureChecklistItem.updateMany({
          where: { id: { in: ids } },
          data: { dueAt: new Date(departureAt.getTime() - offset * DAY_MS) },
        }),
      ),
    );
  }

  private assertAccess(ownerId: string, actor: AuthenticatedUser): void {
    if (!isStaff(actor.role) && ownerId !== actor.id) {
      throw new ForbiddenException('Энэ үйлчилгээний бэлтгэлд хандах эрхгүй байна');
    }
  }

  private async getOrThrow(caseId: string) {
    const plan = await this.prisma.departurePlan.findUnique({ where: { caseId }, include: PLAN_INCLUDE });
    if (!plan) throw new NotFoundException('Энэ үйлчилгээнд явахын өмнөх бэлтгэл нээгдээгүй байна');
    return plan;
  }
}

export function progressOf(items: { isDone: boolean }[]) {
  const done = items.filter((item) => item.isDone).length;
  return { total: items.length, done, percent: items.length === 0 ? 0 : Math.round((done / items.length) * 100) };
}
