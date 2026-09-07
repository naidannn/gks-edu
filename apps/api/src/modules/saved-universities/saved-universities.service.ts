import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CARD_SELECT } from './saved-universities.select.js';

@Injectable()
export class SavedUniversitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.savedUniversity.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true, university: { select: CARD_SELECT } },
    });
    return rows.map((row) => ({ savedAt: row.createdAt, university: row.university }));
  }

  /** Idempotent — saving an already-saved school just returns it. */
  async save(userId: string, universityId: string) {
    const university = await this.prisma.university.findFirst({
      where: { id: universityId, isPublished: true },
      select: { id: true },
    });
    if (!university) throw new NotFoundException(`Сургууль ${universityId} олдсонгүй`);

    await this.prisma.savedUniversity.upsert({
      where: { userId_universityId: { userId, universityId } },
      create: { userId, universityId },
      update: {},
    });
  }

  async unsave(userId: string, universityId: string): Promise<void> {
    await this.prisma.savedUniversity.deleteMany({ where: { userId, universityId } });
  }
}
