import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { type CaseStage, Prisma, Role } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AssignCaseDto } from './dto/assign-case.dto.js';
import type { CreateCaseDto } from './dto/create-case.dto.js';
import type { QueryCasesDto } from './dto/query-cases.dto.js';
import type { TransitionCaseDto } from './dto/transition-case.dto.js';

/** Either the app-wide `PrismaService` or an interactive `$transaction` callback client. */
type Db = PrismaService | Prisma.TransactionClient;

const STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT] as const;

@Injectable()
export class CasesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCaseDto) {
    const code = await this.generateCode();
    return this.prisma.case.create({
      data: {
        code,
        userId: dto.userId,
        serviceType: dto.serviceType,
        universityId: dto.universityId,
        programId: dto.programId,
        intakeId: dto.intakeId,
      },
    });
  }

  /** A logged-in user's own cases (1C-17) — there's no lead-conversion UI yet to link from, so this is the entry point. */
  async findMine(userId: string) {
    return this.prisma.case.findMany({
      where: { userId },
      include: { university: { select: { id: true, nameMn: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllStaff(query: QueryCasesDto) {
    const where = this.buildWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.case.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          university: { select: { id: true, nameMn: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.case.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const found = await this.getOrThrow(id, {
      user: { select: { id: true, name: true, email: true } },
      university: { select: { id: true, nameMn: true } },
      assignedConsultant: { select: { id: true, name: true } },
      assignedDocOfficer: { select: { id: true, name: true } },
      contract: true,
      payments: { orderBy: { createdAt: 'desc' } },
      transitions: { orderBy: { createdAt: 'desc' }, take: 20, include: { actor: { select: { id: true, name: true } } } },
    });
    this.assertReadAccess(found, user);
    return found;
  }

  async assign(id: string, dto: AssignCaseDto) {
    await this.getOrThrow(id);

    if (dto.assignedConsultantId) {
      await this.assertActiveStaff(dto.assignedConsultantId, [Role.ADMIN, Role.CONSULTANT]);
    }
    if (dto.assignedDocOfficerId) {
      await this.assertActiveStaff(dto.assignedDocOfficerId, [Role.ADMIN, Role.DOC_OFFICER]);
    }

    return this.prisma.case.update({
      where: { id },
      data: {
        assignedConsultantId: dto.assignedConsultantId ?? null,
        assignedDocOfficerId: dto.assignedDocOfficerId ?? null,
      },
    });
  }

  private async assertActiveStaff(userId: string, allowedRoles: Role[]): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: { in: allowedRoles }, isActive: true } });
    if (!user) throw new BadRequestException('Идэвхтэй, тохирох эрхтэй ажилтан олдсонгүй');
  }

  /** Staff-triggered move (1C-03) — validated against `CaseFlowDefinition`, never a free-form `PATCH`. */
  async transition(id: string, dto: TransitionCaseDto, actor: AuthenticatedUser) {
    const found = await this.getOrThrow(id);

    const rule = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: {
          serviceType: found.serviceType,
          fromStage: found.stage,
          toStage: dto.toStage,
        },
      },
    });

    if (!rule) {
      throw new BadRequestException(`${found.stage} төлөвөөс ${dto.toStage} рүү шилжих боломжгүй`);
    }
    if (rule.isSystemOnly) {
      throw new BadRequestException('Энэ шилжилтийг зөвхөн систем автоматаар хийнэ (төлбөр/гэрээ баталгаажсанаар)');
    }
    if (rule.allowedRoles.length > 0 && !rule.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('Танд энэ шилжилтийг хийх эрх байхгүй');
    }

    return this.writeTransition(this.prisma, found.id, found.stage, dto.toStage, actor.id, dto.reason);
  }

  /**
   * System-triggered move (1C-15) — `ContractsService`/`PaymentsService` call
   * this once their own condition is met; `actorId` is always null on the
   * resulting `CaseTransition`. Pass `db` as the enclosing `$transaction`
   * callback client so the case update commits atomically with the caller's.
   */
  async applySystemTransition(db: Db, caseId: string, toStage: CaseStage): Promise<void> {
    const found = await db.case.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);

    const rule = await db.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: found.serviceType, fromStage: found.stage, toStage },
      },
    });
    if (!rule?.isSystemOnly) {
      throw new BadRequestException(`${found.stage} -> ${toStage} системийн шилжилт биш эсвэл тодорхойлогдоогүй байна`);
    }

    await this.writeTransition(db, caseId, found.stage, toStage, null, null);
  }

  private async writeTransition(
    db: Db,
    caseId: string,
    fromStage: CaseStage,
    toStage: CaseStage,
    actorId: string | null,
    reason?: string | null,
  ) {
    const [updated] = await Promise.all([
      db.case.update({ where: { id: caseId }, data: { stage: toStage } }),
      db.caseTransition.create({ data: { caseId, fromStage, toStage, actorId, reason: reason ?? null } }),
    ]);
    return updated;
  }

  private assertReadAccess(found: { userId: string }, user: AuthenticatedUser): void {
    const isStaff = (STAFF_ROLES as readonly Role[]).includes(user.role);
    if (!isStaff && found.userId !== user.id) {
      throw new ForbiddenException('Энэ хэрэгт хандах эрхгүй байна');
    }
  }

  private async getOrThrow(id: string, include?: Prisma.CaseInclude) {
    const found = await this.prisma.case.findUnique({ where: { id }, include });
    if (!found) throw new NotFoundException(`Case ${id} not found`);
    return found;
  }

  private buildWhere(query: QueryCasesDto): Prisma.CaseWhereInput {
    const where: Prisma.CaseWhereInput = {};
    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { user: { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }] } },
      ];
    }
    if (query.stage) where.stage = query.stage;
    if (query.serviceType) where.serviceType = query.serviceType;
    if (query.assignedConsultantId) where.assignedConsultantId = query.assignedConsultantId;
    if (query.assignedDocOfficerId) where.assignedDocOfficerId = query.assignedDocOfficerId;
    return where;
  }

  /** `GKS-{year}-{seq}` (§5) — sequence resets each calendar year. */
  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GKS-${year}-`;
    const count = await this.prisma.case.count({ where: { code: { startsWith: prefix } } });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
  }
}
