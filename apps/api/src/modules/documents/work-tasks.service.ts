import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { DOC_STAFF_ROLES } from '../../common/constants/roles.js';
import { type Prisma, Role, WorkTaskStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateWorkTaskDto, QueryWorkTasksDto, UpdateWorkTaskDto } from './dto/work-task.dto.js';

/** Everything not yet finished — the filter every "what is left" query uses. */
const OPEN_STATUSES = [WorkTaskStatus.TODO, WorkTaskStatus.IN_PROGRESS];

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true } },
  case: { select: { id: true, code: true, user: { select: { id: true, name: true } } } },
  lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: true } },
  caseDocument: { select: { id: true, template: { select: { code: true, nameMn: true } } } },
} satisfies Prisma.WorkTaskInclude;

/**
 * 1D-10 — back-office work on a case (gksedu.md §6.4): translations, form
 * filling, essays, final checks. Assignment and due dates live here so the
 * staff workload report (§15.6) has one place to read from.
 *
 * 1B-05 extended it to the sales side: a follow-up on a `Lead` is the same
 * kind of row (who, what, by when), so it is the same table rather than a
 * parallel one. Exactly one of `caseId` / `leadId` is set.
 */
@Injectable()
export class WorkTasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateWorkTaskDto, actor: AuthenticatedUser) {
    if (Boolean(dto.caseId) === Boolean(dto.leadId)) {
      throw new BadRequestException('Ажил нь хэрэг эсвэл сэжмийн аль нэгэнд харьяалагдана');
    }
    if (dto.assigneeId) await this.assertAssignable(dto.assigneeId);

    return this.prisma.workTask.create({
      data: {
        caseId: dto.caseId,
        leadId: dto.leadId,
        caseDocumentId: dto.caseDocumentId,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        createdById: actor.id,
      },
      include: TASK_INCLUDE,
    });
  }

  async findAll(query: QueryWorkTasksDto) {
    const where: Prisma.WorkTaskWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.caseId) where.caseId = query.caseId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.dueBefore) where.dueAt = { lte: new Date(query.dueBefore) };
    if (query.overdueOnly) {
      where.dueAt = { lt: new Date() };
      where.status = { in: OPEN_STATUSES };
    }

    const [items, total] = await Promise.all([
      this.prisma.workTask.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.workTask.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async update(id: string, dto: UpdateWorkTaskDto) {
    const task = await this.prisma.workTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Даалгавар ${id} олдсонгүй`);
    if (dto.assigneeId) await this.assertAssignable(dto.assigneeId);

    const completing = dto.status === WorkTaskStatus.DONE && task.status !== WorkTaskStatus.DONE;

    return this.prisma.workTask.update({
      where: { id },
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        status: dto.status,
        assigneeId: dto.assigneeId,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        completedAt: completing ? new Date() : dto.status && dto.status !== WorkTaskStatus.DONE ? null : undefined,
      },
      include: TASK_INCLUDE,
    });
  }

  async remove(id: string) {
    const task = await this.prisma.workTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Даалгавар ${id} олдсонгүй`);
    return this.prisma.workTask.update({ where: { id }, data: { status: WorkTaskStatus.CANCELLED } });
  }

  /** Per-assignee open workload — the input to the staff performance report (1G-11). */
  async workload() {
    const rows = await this.prisma.workTask.groupBy({
      by: ['assigneeId', 'status'],
      where: { status: { in: OPEN_STATUSES } },
      _count: { _all: true },
    });
    const overdue = await this.prisma.workTask.count({
      where: { status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() } },
    });
    return { rows, overdue };
  }

  private async assertAssignable(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, role: { in: DOC_STAFF_ROLES as unknown as Role[] } },
    });
    if (!user) throw new BadRequestException('Идэвхтэй, тохирох эрхтэй ажилтан олдсонгүй');
  }
}
