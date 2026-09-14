import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessLevel, KnowledgeKind, KnowledgeStatus } from '../../../prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { StorageService } from '../../../storage/storage.service.js';
import { IngestService } from './ingest.service.js';
import type { KnowledgeService } from './knowledge.service.js';

const DOC = '44444444-4444-4444-8444-444444444444';

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    title: 'Тэтгэлгийн материал',
    kind: KnowledgeKind.ENTRY,
    question: 'Материалаа хэзээ бэлдэх вэ?',
    body: 'Орчуулга, нотариат, шуудан гэсэн гурван ажил байдаг тул эрт эхлэх нь зөв.',
    sourceFile: null,
    accessLevel: AccessLevel.PUBLIC,
    universityId: null,
    contentHash: null,
    status: KnowledgeStatus.PUBLISHED,
    ...overrides,
  };
}

function harness(row: Record<string, unknown> | null = documentRow()) {
  const prisma = {
    knowledgeDocument: {
      findUnique: vi.fn().mockResolvedValue(row),
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  const knowledge = {
    replaceChunks: vi.fn().mockResolvedValue(1),
    recordIndexError: vi.fn().mockResolvedValue(undefined),
    markForReindex: vi.fn().mockResolvedValue(undefined),
  } as unknown as KnowledgeService;

  const storage = { read: vi.fn() } as unknown as StorageService;
  const queue = { add: vi.fn().mockResolvedValue(undefined) };

  const service = new IngestService(queue as never, prisma, knowledge, storage);
  return { service, prisma, knowledge, storage, queue };
}

describe('IngestService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('indexes a text document, embedding its question with the body', async () => {
    const { service, knowledge } = harness();

    await expect(service.execute(DOC)).resolves.toBe('indexed');

    const call = vi.mocked(knowledge.replaceChunks).mock.calls[0]![0];
    expect(call.chunks).toHaveLength(1);
    // An answer card has to be findable by the question it answers, so the
    // question becomes the chunk's heading — and `replaceChunks` embeds the
    // heading with the body, which is how the question reaches the vector.
    expect(call.chunks[0]!.heading).toBe('Материалаа хэзээ бэлдэх вэ?');
    expect(call.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stops at the hash when nothing changed, without paying for embeddings', async () => {
    const { service, knowledge } = harness();

    // First run computes the hash; feed it back as the stored one.
    await service.execute(DOC);
    const { contentHash } = vi.mocked(knowledge.replaceChunks).mock.calls[0]![0];

    const second = harness(documentRow({ contentHash }));
    await expect(second.service.execute(DOC)).resolves.toBe('unchanged');
    expect(second.knowledge.replaceChunks).not.toHaveBeenCalled();
  });

  it('re-indexes after a retitle — the title is embedded with every chunk', async () => {
    const { service, knowledge } = harness();
    await service.execute(DOC);
    const { contentHash } = vi.mocked(knowledge.replaceChunks).mock.calls[0]![0];

    const renamed = harness(documentRow({ contentHash, title: 'Өөр гарчиг' }));
    await expect(renamed.service.execute(DOC)).resolves.toBe('indexed');
  });

  it('reads a FILE document out of storage and extracts it', async () => {
    const { service, storage, knowledge } = harness(
      documentRow({ kind: KnowledgeKind.FILE, question: null, body: null, sourceFile: 'knowledge/1-abc.md' }),
    );
    vi.mocked(storage.read).mockResolvedValue(Buffer.from('# Виз\n\nПаспорт шаардлагатай.', 'utf8'));

    await expect(service.execute(DOC)).resolves.toBe('indexed');

    expect(storage.read).toHaveBeenCalledWith('knowledge/1-abc.md');
    expect(vi.mocked(knowledge.replaceChunks).mock.calls[0]![0].chunks[0]!.heading).toBe('Виз');
  });

  it('records an unsupported file type on the row and fails the job', async () => {
    const { service, knowledge } = harness(
      documentRow({ kind: KnowledgeKind.FILE, body: null, sourceFile: 'knowledge/1-abc.xlsx' }),
    );

    await expect(service.execute(DOC)).rejects.toThrow(/xlsx/);
    // The row carries the reason: three attempts later it is the only
    // explanation anybody will have.
    expect(knowledge.recordIndexError).toHaveBeenCalledWith(DOC, expect.stringContaining('xlsx'));
  });

  it('marks an empty document rather than indexing nothing', async () => {
    const { service, knowledge } = harness(documentRow({ body: '   ' }));

    await expect(service.execute(DOC)).resolves.toBe('skipped-empty');
    expect(knowledge.recordIndexError).toHaveBeenCalledWith(DOC, expect.stringContaining('текст'));
    expect(knowledge.replaceChunks).not.toHaveBeenCalled();
  });

  it('queues one job per document, keyed by its id', async () => {
    const { service, queue } = harness();

    await service.enqueue(DOC);

    expect(queue.add).toHaveBeenCalledWith(
      'ingest-document',
      { documentId: DOC },
      expect.objectContaining({ jobId: DOC, attempts: 3 }),
    );
  });

  it('survives Redis being down — the save must not fail with it', async () => {
    const { service, queue } = harness();
    queue.add.mockRejectedValue(new Error('Redis is down'));

    await expect(service.enqueue(DOC)).resolves.toBeUndefined();
  });

  it('clears the hash before queueing a reindex', async () => {
    const { service, knowledge, queue } = harness();

    await service.reindex(DOC);

    expect(knowledge.markForReindex).toHaveBeenCalledWith(DOC);
    expect(queue.add).toHaveBeenCalled();
  });

  it('throws for a document that no longer exists', async () => {
    const { service } = harness(null);

    await expect(service.execute(DOC)).rejects.toThrow(/олдсонгүй/);
  });
});
