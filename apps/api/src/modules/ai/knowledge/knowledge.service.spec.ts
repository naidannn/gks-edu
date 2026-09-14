import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessLevel,
  KnowledgeCategory,
  KnowledgeKind,
  KnowledgeStatus,
  Role,
} from '../../../prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { EmbeddingService } from '../embedding/embedding.service.js';
import type { QueryKnowledgeDocumentsDto } from './dto/knowledge-document.dto.js';
import { KnowledgeService } from './knowledge.service.js';

const DOC = '55555555-5555-4555-8555-555555555555';

function harness(existing: Record<string, unknown> | null = null) {
  const prisma = {
    knowledgeDocument: {
      create: vi.fn().mockImplementation(({ data }: { data: unknown }) => ({ id: DOC, ...(data as object) })),
      update: vi.fn().mockImplementation(({ data }: { data: unknown }) => ({ id: DOC, ...(data as object) })),
      findUnique: vi.fn().mockResolvedValue(existing),
      delete: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({ id: DOC }),
    },
    knowledgeChunk: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
  } as unknown as PrismaService;

  const embeddings = { size: 1536, embedMany: vi.fn() } as unknown as EmbeddingService;

  return { service: new KnowledgeService(prisma, embeddings), prisma };
}

const card = {
  title: 'GKS-ийн хугацаа',
  kind: KnowledgeKind.ENTRY,
  category: KnowledgeCategory.SCHOLARSHIP,
  question: 'Хэзээ эхлэх вэ?',
  body: 'Эрт эхлэх нь зөв.',
};

describe('KnowledgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('answer cards (2A-08)', () => {
    it('stores a card with its question', async () => {
      const { service, prisma } = harness();

      await service.create(card, 'user-1');

      expect(vi.mocked(prisma.knowledgeDocument.create).mock.calls[0]![0].data).toMatchObject({
        kind: KnowledgeKind.ENTRY,
        question: 'Хэзээ эхлэх вэ?',
        status: KnowledgeStatus.DRAFT,
      });
    });

    it('refuses a card with no question — a card is found by its question', async () => {
      const { service } = harness();

      await expect(service.create({ ...card, question: '  ' }, null)).rejects.toThrow(BadRequestException);
    });

    it('refuses an empty body', async () => {
      const { service } = harness();

      await expect(service.create({ ...card, body: '' }, null)).rejects.toThrow(/хоосон/);
    });

    it('refuses to write a FAQ or an article by hand — those are mirrors', async () => {
      const { service } = harness();

      for (const kind of [KnowledgeKind.FAQ, KnowledgeKind.POST]) {
        await expect(service.create({ ...card, kind }, null)).rejects.toThrow(/автоматаар|байршуулах/);
      }
    });

    it('refuses to fabricate a FILE document without an upload', async () => {
      const { service } = harness();

      await expect(service.create({ ...card, kind: KnowledgeKind.FILE }, null)).rejects.toThrow(/байршуулах/);
    });
  });

  describe('playbooks (2A-09)', () => {
    it('is INTERNAL whatever the form asked for', async () => {
      const { service, prisma } = harness();

      await service.create(
        { ...card, kind: KnowledgeKind.PLAYBOOK, accessLevel: AccessLevel.PUBLIC, question: null },
        null,
      );

      expect(vi.mocked(prisma.knowledgeDocument.create).mock.calls[0]![0].data).toMatchObject({
        accessLevel: AccessLevel.INTERNAL,
      });
    });

    it('cannot be lowered by an edit either', async () => {
      const { service, prisma } = harness({ id: DOC, kind: KnowledgeKind.PLAYBOOK, body: 'x' });

      await service.update(DOC, { accessLevel: AccessLevel.REGISTERED }, null);

      expect(vi.mocked(prisma.knowledgeDocument.update).mock.calls[0]![0].data).toMatchObject({
        accessLevel: AccessLevel.INTERNAL,
      });
    });
  });

  describe('who sees what (2E-01)', () => {
    function listHarness() {
      const prisma = {
        knowledgeDocument: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaService;
      const embeddings = { size: 1536 } as unknown as EmbeddingService;
      return { service: new KnowledgeService(prisma, embeddings), prisma };
    }

    /** `skip` is a getter on the DTO class, so spreading one loses it. */
    const queryWith = (overrides: Partial<QueryKnowledgeDocumentsDto> = {}) =>
      ({ page: 1, limit: 20, skip: 0, ...overrides }) as QueryKnowledgeDocumentsDto;

    /** The `where` the service handed Prisma — where the whole rule lives. */
    const whereOf = (prisma: PrismaService) =>
      (vi.mocked(prisma.knowledgeDocument.findMany).mock.calls[0]![0] as { where: Record<string, unknown> })
        .where;

    it('shows an admin everything', async () => {
      const { service, prisma } = listHarness();

      await service.list(queryWith(), Role.ADMIN);

      expect(whereOf(prisma)).toMatchObject({ accessLevel: undefined });
    });

    it('hides INTERNAL from a consultant', async () => {
      const { service, prisma } = listHarness();

      await service.list(queryWith(), Role.CONSULTANT);

      expect(whereOf(prisma).accessLevel).toEqual({
        in: [AccessLevel.PUBLIC, AccessLevel.REGISTERED, AccessLevel.CONTRACTED],
      });
    });

    it('answers a consultant asking for INTERNAL with nothing, not with the documents', async () => {
      const { service, prisma } = listHarness();

      await service.list(queryWith({ accessLevel: AccessLevel.INTERNAL }), Role.CONSULTANT);

      // Intersected with the ceiling, not substituted for it.
      expect(whereOf(prisma).accessLevel).toEqual({ in: [] });
    });

    it('keeps a narrower filter a consultant is entitled to', async () => {
      const { service, prisma } = listHarness();

      await service.list(queryWith({ accessLevel: AccessLevel.CONTRACTED }), Role.CONSULTANT);

      expect(whereOf(prisma).accessLevel).toBe(AccessLevel.CONTRACTED);
    });
  });

  describe('editing', () => {
    it('drops the index when the body changes', async () => {
      const { service, prisma } = harness({ id: DOC, kind: KnowledgeKind.ENTRY, body: 'хуучин' });

      await service.update(DOC, { body: 'шинэ' }, null);

      expect(vi.mocked(prisma.knowledgeDocument.update).mock.calls[0]![0].data).toMatchObject({
        contentHash: null,
        indexedAt: null,
      });
    });

    it('leaves the index alone when only the title changes', async () => {
      const { service, prisma } = harness({ id: DOC, kind: KnowledgeKind.ENTRY, body: 'хуучин' });

      await service.update(DOC, { title: 'Шинэ гарчиг' }, null);

      expect(vi.mocked(prisma.knowledgeDocument.update).mock.calls[0]![0].data).not.toHaveProperty('contentHash');
    });

    it('refuses to change a document’s kind after the fact', async () => {
      const { service } = harness({ id: DOC, kind: KnowledgeKind.ENTRY, body: 'x' });

      await expect(service.update(DOC, { kind: KnowledgeKind.PLAYBOOK }, null)).rejects.toThrow(/төрлийг/);
    });

    it('copies a moved access level onto the chunks', async () => {
      const { service, prisma } = harness();
      vi.mocked(prisma.knowledgeDocument.findUnique).mockResolvedValue({
        accessLevel: AccessLevel.INTERNAL,
        universityId: null,
      } as never);

      await service.syncChunkAccess(DOC);

      expect(prisma.knowledgeChunk.updateMany).toHaveBeenCalledWith({
        where: { documentId: DOC },
        data: { accessLevel: AccessLevel.INTERNAL, universityId: null },
      });
    });
  });
});
