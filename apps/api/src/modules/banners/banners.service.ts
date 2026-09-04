import { Injectable, NotFoundException } from '@nestjs/common';
import type { BannerPlacement } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateBannerDto, UpdateBannerDto } from './dto/banner.dto.js';

/**
 * 1G-14 — the banner half of content management. A banner is live when it is
 * published *and* today falls inside its window; both bounds are optional, so
 * "publish now, no end date" is the default shape.
 */
@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public site — only what is live right now. */
  async findLive(placement?: BannerPlacement, now: Date = new Date()) {
    return this.prisma.banner.findMany({
      where: {
        ...(placement ? { placement } : {}),
        isPublished: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /** Admin — everything, including drafts and expired rows. */
  async findAll() {
    return this.prisma.banner.findMany({ orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] });
  }

  async create(dto: CreateBannerDto) {
    return this.prisma.banner.create({
      data: { ...toData(dto), placement: dto.placement, titleMn: dto.titleMn },
    });
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.getOrThrow(id);
    return this.prisma.banner.update({ where: { id }, data: toData(dto) });
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    await this.prisma.banner.delete({ where: { id } });
  }

  private async getOrThrow(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner) throw new NotFoundException('Баннер олдсонгүй');
    return banner;
  }
}

function toData(dto: Partial<CreateBannerDto>) {
  return {
    ...(dto.placement !== undefined ? { placement: dto.placement } : {}),
    ...(dto.titleMn !== undefined ? { titleMn: dto.titleMn } : {}),
    ...(dto.bodyMn !== undefined ? { bodyMn: dto.bodyMn || null } : {}),
    ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl || null } : {}),
    ...(dto.linkLabel !== undefined ? { linkLabel: dto.linkLabel || null } : {}),
    ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
    ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
    ...(dto.isPublished !== undefined ? { isPublished: dto.isPublished } : {}),
    ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
  };
}
