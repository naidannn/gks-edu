import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.user.findMany({
      where: {
        role: { in: STAFF_ROLE_VALUES },
        ...(includeInactive ? {} : { isActive: true }),
      },
      select: {
        ...PUBLIC_FIELDS,
        phone: true,
        claimedAt: true,
        _count: { select: { assignedLeads: true, assignedCasesAsConsultant: true, assignedCasesAsDocOfficer: true } },
      },
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { name: 'asc' }],
    });
  }

  /**
   * Creates a staff member with no password — they set their own through the
   * claim invitation (1B-17), so an admin never handles someone's credentials.
   */
  async createStaff(dto: CreateStaffDto) {
    assertStaffRole(dto.role);

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('Энэ имэйлээр бүртгэл аль хэдийн үүссэн байна');

    return this.prisma.user.create({
      data: { email, name: dto.name.trim(), phone: dto.phone?.trim(), role: dto.role },
      select: PUBLIC_FIELDS,
    });
  }

  async updateStaff(id: string, dto: UpdateStaffDto) {
    if (dto.role) assertStaffRole(dto.role);

    const target = await this.prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) throw new NotFoundException(`Хэрэглэгч ${id} олдсонгүй`);

    // Demoting or deactivating the last admin locks everyone out of settings.
    const losesAdmin =
      target.role === Role.ADMIN && ((dto.role && dto.role !== Role.ADMIN) || dto.isActive === false);
    if (losesAdmin) {
      const admins = await this.prisma.user.count({ where: { role: Role.ADMIN, isActive: true } });
      if (admins <= 1) throw new ConflictException('Системд дор хаяж нэг идэвхтэй админ үлдэх ёстой');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
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
}

/** `USER` is what a client is; it can never be granted as a staff role. */
const STAFF_ROLE_VALUES: Role[] = [Role.ADMIN, Role.CONSULTANT, Role.DOC_OFFICER];

function assertStaffRole(role: Role): void {
  if (!STAFF_ROLE_VALUES.includes(role)) {
    throw new BadRequestException('Зөвхөн ADMIN, CONSULTANT, DOC_OFFICER эрх олгоно');
  }
}
