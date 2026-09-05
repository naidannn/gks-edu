import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { Prisma, Role } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const USER_CACHE_TTL_MS = 60_000;
const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(page: number, limit: number, search?: string) {
    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_FIELDS,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return paginate(items, total, page, limit);
  }

  /**
   * Active staff, for the assignment dropdowns (1B-04, 1D-10). Deliberately
   * narrow — name and role only — so it can be readable by every staff member
   * without exposing the full user list `findAll` returns.
   */
  async findStaff() {
    return this.prisma.user.findMany({
      where: { isActive: true, role: { in: [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.cache.wrap(
      `user:${id}`,
      async () => {
        const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_FIELDS });
        if (!user) {
          throw new NotFoundException(`User ${id} not found`);
        }
        return user;
      },
      USER_CACHE_TTL_MS,
    );
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: PUBLIC_FIELDS,
    });

    await this.cache.del(`user:${id}`);
    return user;
  }

  async remove(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
    await this.cache.del(`user:${id}`);
  }

  // ─── Staff administration (1G-12) ─────────────────────────────────────────

  /** Everyone with a staff role, active or not — the admin list, unlike `findStaff`. */
  async listStaff(includeInactive = true) {
    const rows = await this.prisma.user.findMany({
      where: {
        role: { in: STAFF_ROLE_VALUES },
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...PUBLIC_FIELDS,
        phone: true,
        claimedAt: true,
        // Read only to answer "can this person get in?"; both are dropped below.
        password: true,
        googleId: true,
        _count: { select: STAFF_TRACE_COUNTS },
      },
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });

    const activeAdmins = rows.filter((row) => row.isActive && row.role === Role.ADMIN).length;

    return rows.map(({ password, googleId, _count, ...row }) => ({
      ...row,
      _count,
      /** Has a way in already — a password they set, or a linked Google account. */
      hasLogin: Boolean(password) || Boolean(googleId),
      /** Assignments they are carrying right now — what an admin re-assigns before deactivating. */
      workload: _count.assignedLeads + _count.assignedCasesAsConsultant + _count.assignedCasesAsDocOfficer,
      /**
       * A row is only erasable while it has left no trace. Everything else has
       * to be deactivated instead, because most of the actor columns are
       * `onDelete: SetNull` — deleting the account would quietly anonymise the
       * contracts, reviews and audit trail it is named on.
       */
      deletable: traceTotal(_count) === 0 && !(row.role === Role.ADMIN && activeAdmins <= 1),
    }));
  }

  /**
   * Creates a staff member. Two ways in, and the admin picks per person:
   *
   * - with a `password` — the account works the moment it is saved, and the
   *   admin passes the password on themselves;
   * - without one — the row stays password-less and the person sets their own
   *   through the claim invitation (1B-17).
   *
   * A password typed here counts as claimed: there is no invitation left to
   * answer, so `claimedAt` is stamped now rather than left hanging.
   */
  async createStaff(dto: CreateStaffDto) {
    assertStaffRole(dto.role);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна');

    return this.prisma.user.create({
      data: {
        email,
        name: dto.name.trim(),
        phone: dto.phone?.trim(),
        role: dto.role,
        ...(dto.password
          ? { password: await hash(dto.password, BCRYPT_ROUNDS), claimedAt: new Date() }
          : {}),
      },
      select: PUBLIC_FIELDS,
    });
  }

  /**
   * Sets or replaces a staff member's password (1G-12). Every session they had
   * open dies with the old password — a reset an admin performs is usually a
   * reset *because* something went wrong, and a stolen refresh token must not
   * outlive it. An outstanding claim invitation is spent at the same time,
   * because the account now has the login the invitation was offering.
   */
  async setStaffPassword(id: string, password: string, actorId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, claimedAt: true },
    });
    if (!target) throw new NotFoundException(`Хэрэглэгч ${id} олдсонгүй`);
    assertStaffTarget(target.role);

    // Own password goes through `/auth/password/change`, which asks for the
    // current one — an admin session left open must not be able to re-key
    // itself without proving who is sitting at it.
    if (id === actorId) {
      throw new ConflictException('Өөрийн нууц үгээ "Миний бүртгэл" хэсгээс солино уу');
    }

    await this.prisma.user.update({
      where: { id },
      data: {
        password: await hash(password, BCRYPT_ROUNDS),
        claimTokenHash: null,
        claimTokenExpiresAt: null,
        claimedAt: target.claimedAt ?? new Date(),
      },
      select: { id: true },
    });

    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.cache.del(`user:${id}`);
  }

  async updateStaff(id: string, dto: UpdateStaffDto, actorId?: string) {
    if (dto.role) assertStaffRole(dto.role);

    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException(`Хэрэглэгч ${id} олдсонгүй`);
    assertStaffTarget(target.role);

    const losesAdmin =
      target.role === Role.ADMIN && ((dto.role && dto.role !== Role.ADMIN) || dto.isActive === false);

    // Locking yourself out is always a mistake, even while other admins remain.
    if (losesAdmin && actorId === id) {
      throw new ConflictException('Өөрийнхөө админ эрхийг өөрөө хасах боломжгүй');
    }

    // Demoting or deactivating the last admin locks everyone out of settings.
    if (losesAdmin) {
      const admins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (admins <= 1) throw new ConflictException('Системд дор хаяж нэг идэвхтэй админ үлдэх ёстой');
    }

    const email = dto.email?.trim().toLowerCase();
    if (email) {
      const clash = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash && clash.id !== id) throw new ConflictException('Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(email !== undefined ? { email } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: PUBLIC_FIELDS,
    });

    await this.cache.del(`user:${id}`);
    return user;
  }

  /**
   * Erases a staff account outright. Only ever allowed for a row that has left
   * no trace — a mistyped invitation, an account nobody ever used. The moment
   * someone has been assigned a lead, signed off a document or appeared in the
   * audit log, the account is history and can only be deactivated.
   */
  async deleteStaff(id: string, actorId: string): Promise<void> {
    if (id === actorId) throw new ConflictException('Өөрийн бүртгэлээ устгах боломжгүй');

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true, isActive: true, _count: { select: STAFF_TRACE_COUNTS } },
    });
    if (!target) throw new NotFoundException(`Хэрэглэгч ${id} олдсонгүй`);
    assertStaffTarget(target.role);

    if (target.role === Role.ADMIN && target.isActive) {
      const admins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (admins <= 1) throw new ConflictException('Системд дор хаяж нэг идэвхтэй админ үлдэх ёстой');
    }

    if (traceTotal(target._count) > 0) {
      throw new ConflictException(
        'Энэ ажилтан системд ажлын түүх үлдээсэн тул устгах боломжгүй — идэвхгүй болгоно уу',
      );
    }

    await this.prisma.user.delete({ where: { id } });
    await this.cache.del(`user:${id}`);
  }
}

/**
 * Every relation that makes an account part of the record. Counted together to
 * decide whether the row can be erased or only deactivated.
 */
const STAFF_TRACE_COUNTS = {
  assignedLeads: true,
  assignedCasesAsConsultant: true,
  assignedCasesAsDocOfficer: true,
  leads: true,
  leadActivities: true,
  assignedClients: true,
  createdClients: true,
  cases: true,
  caseTransitions: true,
  contracts: true,
  payments: true,
  documentFiles: true,
  documentReviewNotes: true,
  assignedWorkTasks: true,
  createdWorkTasks: true,
  applicationResults: true,
  invitations: true,
  officeAppointments: true,
  documents: true,
  posts: true,
  auditLogs: true,
} satisfies Prisma.UserCountOutputTypeSelect;

type StaffTraceCounts = Record<keyof typeof STAFF_TRACE_COUNTS, number>;

function traceTotal(counts: StaffTraceCounts): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

/** `USER` is what a client is; it can never be granted as a staff role. */
const STAFF_ROLE_VALUES: Role[] = [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER];

function assertStaffRole(role: Role): void {
  if (!STAFF_ROLE_VALUES.includes(role)) {
    throw new BadRequestException('Зөвхөн ADMIN, CONSULTANT, DOC_OFFICER эрх олгоно');
  }
}

/** This register manages staff only — a client is edited from the client screens. */
function assertStaffTarget(role: Role): void {
  if (!STAFF_ROLE_VALUES.includes(role)) {
    throw new BadRequestException('Энэ бүртгэл системийн хэрэглэгчийн бүртгэл биш');
  }
}
