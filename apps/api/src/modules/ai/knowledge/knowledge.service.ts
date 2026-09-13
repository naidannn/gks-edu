import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { paginate } from '../../../common/dto/pagination.dto.js';
import {
  AccessLevel,
  KnowledgeKind,
  KnowledgeStatus,
  Prisma,
  type KnowledgeDocument,
} from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import type {
  CreateKnowledgeDocumentDto,
  QueryKnowledgeDocumentsDto,
  UpdateKnowledgeDocumentDto,
  UploadKnowledgeDocumentDto,
} from './dto/knowledge-document.dto.js';

/** One chunk ready to be stored — what the chunker (2A-04) produces. */
export interface PreparedChunk {
  /** `H1 > H2 > H3` path this text sits under, or null at the top level. */
  heading: string | null;
  content: string;
  tokenCount: number;
}

const LIST_SELECT = {
  id: true,
  title: true,
  kind: true,
  category: true,
  accessLevel: true,
  status: true,
  serviceType: true,
  validUntil: true,
  sourceFile: true,
  sourceRef: true,
  question: true,
  chunkCount: true,
  indexedAt: true,
  indexError: true,
  createdAt: true,
  updatedAt: true,
  university: { select: { id: true, slug: true, nameMn: true } },
  createdBy: { select: { id: true, name: true } },
  updatedBy: { select: { id: true, name: true } },
} as const;

/**
 * The knowledge base behind the assistant (2A-01, AI-ASSISTANT.md §4).
 *
 * This service owns the *rows*: the documents staff write or upload and the
 * chunks an ingest run replaces. It does not retrieve (`RetrievalService`,
 * 2A-06) and it does not extract or chunk (2A-03/04) — those sit on top of it.
 *
 * Two rules are enforced here rather than left to a screen. A document whose
 * text changed is marked un-indexed, so nothing can be published with chunks
 * that no longer match its body; and every chunk write is one transaction, so a
 * reindex either replaces the whole set or leaves the old one standing. Half a
 * handbook in the index is worse than yesterday's, because a gap answers
 * confidently.
 */
@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  // ─── Documents ──────────────────────────────────────────────────────────────

  async list(query: QueryKnowledgeDocumentsDto) {
    const where: Prisma.KnowledgeDocumentWhereInput = {
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.accessLevel ? { accessLevel: query.accessLevel } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.universityId ? { universityId: query.universityId } : {}),
      ...(query.failedOnly === 'true' ? { indexError: { not: null } } : {}),
      ...(query.staleOnly === 'true' ? { validUntil: { lt: new Date() } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { question: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { body: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };

    // Read-only pair under Promise.all, never $transaction (CLAUDE.md rule 8).
    const [items, total] = await Promise.all([
      this.prisma.knowledgeDocument.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        select: LIST_SELECT,
      }),
      this.prisma.knowledgeDocument.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /** One document with its chunks — `embedding` is never selected: it is huge and Unsupported. */
  async findOne(id: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        body: true,
        contentHash: true,
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          select: { id: true, chunkIndex: true, heading: true, content: true, tokenCount: true },
        },
      },
    });

    if (!document) throw new NotFoundException(`Мэдлэгийн баримт ${id} олдсонгүй`);
    return document;
  }

  /**
   * Stores an uploaded source file as a `FILE` document. The text is not read
   * here — that is the ingest job's work, and it is why the row starts with no
   * hash and no chunks.
   */
  async createFromFile(params: {
    dto: UploadKnowledgeDocumentDto;
    sourceFile: string;
    actorId: string | null;
  }) {
    const { dto, sourceFile, actorId } = params;

    return this.prisma.knowledgeDocument.create({
      data: {
        title: dto.title.trim(),
        kind: KnowledgeKind.FILE,
        category: dto.category,
        accessLevel: dto.accessLevel ?? AccessLevel.PUBLIC,
        status: dto.status ?? KnowledgeStatus.DRAFT,
        universityId: dto.universityId ?? null,
        serviceType: dto.serviceType ?? null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        sourceFile,
        createdById: actorId,
        updatedById: actorId,
      },
      select: LIST_SELECT,
    });
  }

  async create(dto: CreateKnowledgeDocumentDto, actorId: string | null) {
    this.assertWritableKind(dto.kind);
    if (!dto.body?.trim()) {
      throw new BadRequestException('Баримтын бичвэр хоосон байна');
    }
    if (dto.kind === KnowledgeKind.ENTRY && !dto.question?.trim()) {
      throw new BadRequestException('Хариултын картад асуулт шаардлагатай');
    }

    return this.prisma.knowledgeDocument.create({
      data: {
        title: dto.title.trim(),
        kind: dto.kind,
        category: dto.category,
        accessLevel: dto.accessLevel ?? AccessLevel.PUBLIC,
        status: dto.status ?? KnowledgeStatus.DRAFT,
        universityId: dto.universityId ?? null,
        serviceType: dto.serviceType ?? null,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        question: dto.question?.trim() ?? null,
        body: dto.body.trim(),
        createdById: actorId,
        updatedById: actorId,
      },
      select: LIST_SELECT,
    });
  }

  async update(id: string, dto: UpdateKnowledgeDocumentDto, actorId: string | null) {
    const existing = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      select: { id: true, kind: true, body: true },
    });
    if (!existing) throw new NotFoundException(`Мэдлэгийн баримт ${id} олдсонгүй`);
    if (dto.kind && dto.kind !== existing.kind) {
      throw new BadRequestException('Баримтын төрлийг дараа нь солих боломжгүй');
    }

    // Text changed ⇒ the stored chunks describe the old text. Clearing the hash
    // is what makes the next ingest run actually do the work (2A-05).
    const bodyChanged = dto.body !== undefined && dto.body?.trim() !== existing.body;

    return this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.accessLevel !== undefined ? { accessLevel: dto.accessLevel } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.universityId !== undefined ? { universityId: dto.universityId ?? null } : {}),
        ...(dto.serviceType !== undefined ? { serviceType: dto.serviceType ?? null } : {}),
        ...(dto.validUntil !== undefined
          ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }
          : {}),
        ...(dto.question !== undefined ? { question: dto.question?.trim() ?? null } : {}),
        ...(dto.body !== undefined ? { body: dto.body?.trim() ?? null } : {}),
        ...(bodyChanged ? { contentHash: null, indexedAt: null, indexError: null } : {}),
        updatedById: actorId,
      },
      select: LIST_SELECT,
    });
  }

  async remove(id: string): Promise<void> {
    // Chunks go with it — the FK cascades.
    await this.prisma.knowledgeDocument.delete({ where: { id } });
  }

  /** Clears the content hash so the next ingest run re-embeds from scratch. */
  async markForReindex(id: string): Promise<void> {
    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: { contentHash: null, indexError: null },
    });
  }

  /**
   * Upserts a mirrored document (FAQ/POST, 2A-07) keyed by `sourceRef`, so the
   * sync hook updates its own row instead of inserting a second copy of an
   * article every time somebody fixes a typo in it.
   */
  async upsertBySourceRef(params: {
    sourceRef: string;
    title: string;
    kind: KnowledgeKind;
    category: Prisma.KnowledgeDocumentCreateInput['category'];
    accessLevel: AccessLevel;
    status: KnowledgeStatus;
    body: string;
    question?: string | null;
  }): Promise<KnowledgeDocument> {
    const { sourceRef, ...rest } = params;

    return this.prisma.knowledgeDocument.upsert({
      where: { sourceRef },
      create: { sourceRef, ...rest },
      // A mirrored body that changed must lose its hash, same as an edited one.
      update: { ...rest, contentHash: null, indexedAt: null, indexError: null },
    });
  }

  async deleteBySourceRef(sourceRef: string): Promise<void> {
    await this.prisma.knowledgeDocument.deleteMany({ where: { sourceRef } });
  }

  // ─── Chunks ─────────────────────────────────────────────────────────────────

  /**
   * Replaces a document's chunks with `chunks`, embeddings and all, in one
   * transaction.
   *
   * `embedding` is `Unsupported("vector(1536)")`, so every write that touches it
   * is raw SQL (CLAUDE.md rule 4). The `tsv` column is generated by Postgres and
   * is deliberately absent from the INSERT.
   */
  async replaceChunks(params: {
    documentId: string;
    documentTitle: string;
    accessLevel: AccessLevel;
    universityId: string | null;
    chunks: PreparedChunk[];
    contentHash: string;
  }): Promise<number> {
    const { documentId, documentTitle, accessLevel, universityId, chunks, contentHash } = params;

    // Embedded text = document title + heading path + body, so that a chunk
    // under "Дотуур байр" still answers "Ёнсэгийн дотуур байр" (§4.3).
    const vectors = await this.embeddings.embedMany(
      chunks.map((chunk) => [documentTitle, chunk.heading, chunk.content].filter(Boolean).join('\n')),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId } });

      for (const [index, chunk] of chunks.entries()) {
        await tx.$executeRaw`
          INSERT INTO knowledge_chunks
            (id, "documentId", "chunkIndex", heading, content, "tokenCount", "accessLevel", "universityId", embedding, "createdAt")
          VALUES (
            gen_random_uuid(),
            ${documentId}::uuid,
            ${index},
            ${chunk.heading},
            ${chunk.content},
            ${chunk.tokenCount},
            ${accessLevel}::"AccessLevel",
            ${universityId}::uuid,
            ${this.toVectorLiteral(vectors[index]!)}::vector,
            NOW()
          )
        `;
      }

      await tx.knowledgeDocument.update({
        where: { id: documentId },
        data: {
          chunkCount: chunks.length,
          contentHash,
          indexedAt: new Date(),
          indexError: null,
        },
      });
    });

    this.logger.log(`Мэдлэгийн баримт ${documentId}: ${chunks.length} chunk индексжлээ`);
    return chunks.length;
  }

  /** Records why an ingest run failed, so the admin list can show it in red. */
  async recordIndexError(documentId: string, message: string): Promise<void> {
    await this.prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: { indexError: message.slice(0, 500) },
    });
  }

  /**
   * Keeps a document's chunks in step with metadata that is denormalised onto
   * them. Moving a handbook from PUBLIC to INTERNAL has to move its chunks, or
   * the retrieval filter keeps handing the old level out.
   */
  async syncChunkAccess(documentId: string): Promise<void> {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { accessLevel: true, universityId: true },
    });
    if (!document) return;

    await this.prisma.knowledgeChunk.updateMany({
      where: { documentId },
      data: { accessLevel: document.accessLevel, universityId: document.universityId },
    });
  }

  /** Renders a JS number array as the `[1,2,3]` text form pgvector parses. */
  private toVectorLiteral(vector: number[]): string {
    if (vector.length !== this.embeddings.size) {
      throw new Error(
        `Embedding dimension mismatch: got ${vector.length}, expected ${this.embeddings.size}`,
      );
    }
    return `[${vector.join(',')}]`;
  }

  /** FAQ and POST rows are mirrors of content that lives elsewhere. */
  private assertWritableKind(kind: KnowledgeKind): void {
    if (kind === KnowledgeKind.FAQ || kind === KnowledgeKind.POST) {
      throw new BadRequestException(
        'FAQ ба нийтлэл автоматаар индексждэг — контентын хуудсан дээр нь засна уу',
      );
    }
    if (kind === KnowledgeKind.FILE) {
      throw new BadRequestException('Файл баримтыг байршуулах замаар нэмнэ');
    }
  }
}
