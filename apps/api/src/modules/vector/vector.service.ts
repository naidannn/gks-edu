import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';
import type { SearchDto } from './dto/search.dto.js';
import { EmbeddingService } from './embedding.service.js';

export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

/**
 * pgvector access layer.
 *
 * Prisma types the `embedding` column as `Unsupported`, so every read or write
 * that touches it goes through raw SQL here. Everything else stays on the typed
 * client.
 */
@Injectable()
export class VectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async createDocument(dto: CreateDocumentDto, authorId?: string) {
    const vectors = await this.embeddings.embedMany(dto.chunks);

    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({
        data: {
          title: dto.title,
          source: dto.source,
          metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
          authorId,
        },
      });

      for (const [index, content] of dto.chunks.entries()) {
        // `::vector` cast is required — the parameter arrives as a text literal.
        await tx.$executeRaw`
          INSERT INTO document_chunks (id, "documentId", "chunkIndex", content, embedding, "createdAt")
          VALUES (
            gen_random_uuid(),
            ${document.id}::uuid,
            ${index},
            ${content},
            ${this.toVectorLiteral(vectors[index])}::vector,
            NOW()
          )
        `;
      }

      return { ...document, chunkCount: dto.chunks.length };
    });
  }

  async search(dto: SearchDto): Promise<SearchHit[]> {
    const [queryVector] = await this.embeddings.embedMany([dto.query]);
    const literal = this.toVectorLiteral(queryVector);

    // `<=>` is pgvector's cosine distance; similarity is 1 - distance.
    return this.prisma.$queryRaw<SearchHit[]>`
      SELECT
        c.id            AS "chunkId",
        c."documentId"  AS "documentId",
        d.title         AS "documentTitle",
        c."chunkIndex"  AS "chunkIndex",
        c.content       AS content,
        1 - (c.embedding <=> ${literal}::vector) AS similarity
      FROM document_chunks c
      JOIN documents d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
        AND 1 - (c.embedding <=> ${literal}::vector) >= ${dto.minSimilarity}
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${dto.limit}
    `;
  }

  async findDocument(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
          // `embedding` is deliberately omitted: it is Unsupported and huge.
          select: { id: true, chunkIndex: true, content: true, createdAt: true },
        },
      },
    });

    if (!document) {
      throw new NotFoundException(`Баримт ${id} олдсонгүй`);
    }

    return document;
  }

  async listDocuments(page: number, limit: number) {
    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { chunks: true } } },
      }),
      this.prisma.document.count(),
    ]);

    return {
      items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  async removeDocument(id: string): Promise<void> {
    await this.prisma.document.delete({ where: { id } });
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
}
