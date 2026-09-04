import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
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

    const [items, total] = await this.prisma.$transaction([
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
}
