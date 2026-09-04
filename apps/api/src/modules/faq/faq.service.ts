import { Injectable, NotFoundException } from '@nestjs/common';
import { CacheService } from '../../redis/cache.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FaqCategory } from '../../prisma/client.js';
import type { CreateFaqDto } from './dto/create-faq.dto.js';
import type { QueryFaqDto } from './dto/query-faq.dto.js';
import type { UpdateFaqDto } from './dto/update-faq.dto.js';

const CACHE_TTL_MS = 300_000;
/** Every cache key `findPublished` can produce — small and fixed, so listing beats pattern-scanning. */
const ALL_CACHE_KEYS = ['all', ...Object.values(FaqCategory)].map((key) => `faqs:${key}`);

@Injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Public list, grouped for the accordion page (1A-13). */
  async findPublished(query: QueryFaqDto) {
    return this.cache.wrap(
      `faqs:${query.category ?? 'all'}`,
      () =>
        this.prisma.faqItem.findMany({
          where: { isPublished: true, ...(query.category ? { category: query.category } : {}) },
          orderBy: [{ category: 'asc' }, { order: 'asc' }],
          select: { id: true, category: true, question: true, answer: true, order: true },
        }),
      CACHE_TTL_MS,
    );
  }

  // --- Admin CRUD ---

  async findAllAdmin() {
    return this.prisma.faqItem.findMany({ orderBy: [{ category: 'asc' }, { order: 'asc' }] });
  }

  async findOneAdmin(id: string) {
    const faq = await this.prisma.faqItem.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException(`FAQ item ${id} not found`);
    return faq;
  }

  async create(dto: CreateFaqDto) {
    const faq = await this.prisma.faqItem.create({ data: dto });
    await this.invalidate();
    return faq;
  }

  async update(id: string, dto: UpdateFaqDto) {
    await this.findOneAdmin(id);
    const faq = await this.prisma.faqItem.update({ where: { id }, data: dto });
    await this.invalidate();
    return faq;
  }

  async remove(id: string): Promise<void> {
    await this.findOneAdmin(id);
    await this.prisma.faqItem.delete({ where: { id } });
    await this.invalidate();
  }

  private async invalidate(): Promise<void> {
    await Promise.all(ALL_CACHE_KEYS.map((key) => this.cache.del(key)));
  }
}
