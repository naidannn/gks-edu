import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PostStatus } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type { QueryPostsDto } from './dto/query-posts.dto.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';
import { ContentSyncService } from '../ai/knowledge/content-sync.service.js';

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
  constructor(
    private readonly prisma: PrismaService,
    /** 2A-07 — a published article is knowledge the assistant should answer from. */
    private readonly knowledgeSync: ContentSyncService,
  ) {}

  /** Public list — published posts only, newest first (1A-12). */
  async findPublished(query: QueryPostsDto) {
    const where: Prisma.PostWhereInput = {
      status: PostStatus.PUBLISHED,
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };

    const [items, total] = await Promise.all([
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
    if (!post) throw new NotFoundException(`Нийтлэл ${slug} олдсонгүй`);
    return post;
  }

  // --- Admin (staff-only CRUD) ---

  async findAllAdmin(query: QueryPostsDto) {
    const where: Prisma.PostWhereInput = query.tag ? { tags: { has: query.tag } } : {};

    const [items, total] = await Promise.all([
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
    if (!post) throw new NotFoundException(`Нийтлэл ${id} олдсонгүй`);
    return post;
  }

  async create(dto: CreatePostDto, authorId: string) {
    await this.assertSlugFree(dto.slug);
    const post = await this.prisma.post.create({
      data: {
        ...dto,
        authorId,
        publishedAt: this.resolvePublishedAt(dto.status, dto.publishedAt),
      },
      select: DETAIL_FIELDS,
    });

    await this.knowledgeSync.syncPost(post);
    return post;
  }

  async update(id: string, dto: UpdatePostDto) {
    await this.findOneAdmin(id);
    if (dto.slug) await this.assertSlugFree(dto.slug, id);

    const post = await this.prisma.post.update({
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

    // 2A-07 — a draft or archived article is removed from the index rather than
    // left behind, so the assistant cannot quote something that is not on the site.
    await this.knowledgeSync.syncPost(post);
    return post;
  }

  async remove(id: string): Promise<void> {
    await this.findOneAdmin(id);
    await this.prisma.post.delete({ where: { id } });
    await this.knowledgeSync.removePost(id);
  }

  private async assertSlugFree(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.post.findUnique({ where: { slug }, select: { id: true } });
    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`«${slug}» slug аль хэдийн ашиглагдсан байна`);
    }
  }

  /** A post flipping to PUBLISHED without an explicit date is published now. */
  private resolvePublishedAt(status?: PostStatus, explicit?: string): Date | undefined {
    if (explicit) return new Date(explicit);
    if (status === PostStatus.PUBLISHED) return new Date();
    return undefined;
  }
}
