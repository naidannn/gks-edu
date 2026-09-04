import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PostStatus } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { QueryPostsDto } from './dto/query-posts.dto.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';

const CARD_FIELDS = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  coverImagePath: true,
  tags: true,
  publishedAt: true,
} satisfies Prisma.PostSelect;

const DETAIL_FIELDS = {
  ...CARD_FIELDS,
  content: true,
  status: true,
  seoTitle: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.PostSelect;

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public list — published posts only, newest first (1A-12). */
  async findPublished(query: QueryPostsDto) {
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        select: CARD_FIELDS,
        orderBy: { publishedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findPublishedBySlug(slug: string) {
    const post = await this.prisma.post.findFirst({
      where: { slug, status: PostStatus.PUBLISHED },
      select: DETAIL_FIELDS,
    });
    if (!post) throw new NotFoundException(`Post ${slug} not found`);
    return post;
  }

  // --- Admin (staff-only CRUD) ---

  async findAllAdmin(query: QueryPostsDto) {
    const where: Prisma.PostWhereInput = query.tag ? { tags: { has: query.tag } } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.post.findMany({
        where,
        select: DETAIL_FIELDS,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.post.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async findOneAdmin(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id }, select: DETAIL_FIELDS });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async create(dto: CreatePostDto, authorId: string) {
    await this.assertSlugFree(dto.slug);
    return this.prisma.post.create({
      data: {
        ...dto,
        authorId,
        publishedAt: this.resolvePublishedAt(dto.status, dto.publishedAt),
      },
      select: DETAIL_FIELDS,
    });
  }

  async update(id: string, dto: UpdatePostDto) {
    await this.findOneAdmin(id);
    if (dto.slug) await this.assertSlugFree(dto.slug, id);

    return this.prisma.post.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status !== undefined
          ? { publishedAt: this.resolvePublishedAt(dto.status, dto.publishedAt) }
          : dto.publishedAt !== undefined
            ? { publishedAt: new Date(dto.publishedAt) }
            : {}),
      },
      select: DETAIL_FIELDS,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOneAdmin(id);
    await this.prisma.post.delete({ where: { id } });
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { slug }, select: { id: true } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Slug "${slug}" is already used`);
    }
  }

  /** A post flipping to PUBLISHED without an explicit date is published now. */
  private resolvePublishedAt(status?: PostStatus, explicit?: string): Date | undefined {
    if (explicit) return new Date(explicit);
    if (status === PostStatus.PUBLISHED) return new Date();
    return undefined;
  }
}
