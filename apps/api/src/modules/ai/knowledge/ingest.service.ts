import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { KnowledgeKind, KnowledgeStatus } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';
import { AI_INGEST_ATTEMPTS, AI_INGEST_JOB, AI_INGEST_QUEUE } from '../../../queue/queue.constants.js';
import { chunkBlocks } from './chunker.js';
import { extractFile, extractMarkdown, isKnowledgeFileExtension } from './extract/index.js';
import { KnowledgeService } from './knowledge.service.js';

export interface IngestJobData {
  documentId: string;
}

export type IngestOutcome = 'indexed' | 'unchanged' | 'skipped-empty' | 'skipped-playbook';

/**
 * Indexing a knowledge document (2A-05).
 *
 * ```
 * file or body → text + heading tree  (2A-03)
 *              → contentHash — unchanged? stop here
 *              → chunks (2A-04) → embeddings (2A-02)
 *              → knowledge_chunks, replaced in one transaction
 * ```
 *
 * The hash is the part that pays for itself. Saving a document re-queues it, a
 * FAQ edit re-queues it, and "reindex everything" queues all of them — most of
 * those have identical text, and embedding identical text again costs money and
 * rewrites rows the retrieval query is reading.
 *
 * A failure is recorded on the document rather than only thrown: the admin list
 * shows it in red, and three attempts later that message is the only explanation
 * anybody will have.
 */
@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    @InjectQueue(AI_INGEST_QUEUE) private readonly queue: Queue<IngestJobData>,
    private readonly prisma: PrismaService,
    private readonly knowledge: KnowledgeService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Queues one document. `jobId` is the document id, so saving a document five
   * times in a minute leaves one job rather than five: BullMQ drops a duplicate
   * id while the first is still waiting.
   */
  async enqueue(documentId: string): Promise<void> {
    try {
      await this.queue.add(
        AI_INGEST_JOB,
        { documentId },
        {
          jobId: documentId,
          attempts: AI_INGEST_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (error) {
      // Redis down must not fail the save. The document keeps `contentHash:
      // null`, so the next sweep or a manual reindex picks it up.
      this.logger.warn(
        `Индексжүүлэх ажил дараалалд орсонгүй (${documentId}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** "Reindex" — clears the hash, then queues it. */
  async reindex(documentId: string): Promise<void> {
    await this.knowledge.markForReindex(documentId);
    await this.enqueue(documentId);
  }

  /**
   * Queues everything that is not currently indexed — the sweep behind "reindex
   * all", and the recovery path for documents whose enqueue was lost to a Redis
   * outage.
   */
  async enqueuePending(): Promise<number> {
    const documents = await this.prisma.knowledgeDocument.findMany({
      where: { status: KnowledgeStatus.PUBLISHED, OR: [{ contentHash: null }, { indexedAt: null }] },
      select: { id: true },
    });

    for (const document of documents) await this.enqueue(document.id);
    return documents.length;
  }

  /** Runs the pipeline for one document. Called by the processor. */
  async execute(documentId: string): Promise<IngestOutcome> {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        title: true,
        kind: true,
        question: true,
        body: true,
        sourceFile: true,
        accessLevel: true,
        universityId: true,
        contentHash: true,
        status: true,
      },
    });

    if (!document) throw new NotFoundException(`Мэдлэгийн баримт ${documentId} олдсонгүй`);

    try {
      return await this.run(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.knowledge.recordIndexError(documentId, message);
      this.logger.error(`Индексжүүлэлт амжилтгүй (${documentId}): ${message}`);
      // Rethrown so BullMQ retries; the row already carries the reason.
      throw error;
    }
  }

  private async run(document: {
    id: string;
    title: string;
    kind: KnowledgeKind;
    question: string | null;
    body: string | null;
    sourceFile: string | null;
    accessLevel: Parameters<KnowledgeService['replaceChunks']>[0]['accessLevel'];
    universityId: string | null;
    contentHash: string | null;
  }): Promise<IngestOutcome> {
    const { blocks, text } = await this.readText(document);

    if (text.trim().length === 0) {
      await this.knowledge.recordIndexError(document.id, 'Баримтаас текст гарсангүй');
      return 'skipped-empty';
    }

    // The hash covers everything the chunks are built from — the title and the
    // question are embedded with the body, so a renamed card has to be re-indexed.
    const hash = createHash('sha256')
      .update(`${document.title}\n${document.question ?? ''}\n${text}`)
      .digest('hex');

    if (hash === document.contentHash) {
      this.logger.debug(`Мэдлэгийн баримт ${document.id}: агуулга өөрчлөгдөөгүй, индексжүүлэлт шаардлагагүй`);
      return 'unchanged';
    }

    const chunks = chunkBlocks(blocks);
    if (chunks.length === 0) {
      await this.knowledge.recordIndexError(document.id, 'Chunk үүсгэх текст хүрэлцсэнгүй');
      return 'skipped-empty';
    }

    await this.knowledge.replaceChunks({
      documentId: document.id,
      documentTitle: document.title,
      accessLevel: document.accessLevel,
      universityId: document.universityId,
      chunks,
      contentHash: hash,
    });

    return 'indexed';
  }

  /**
   * The text to index. A `FILE` is read back out of storage and extracted;
   * everything else already holds its text in `body`, and an answer card's
   * question is prepended so the card is found by the question it answers —
   * which is the whole point of a card.
   */
  private async readText(document: {
    kind: KnowledgeKind;
    question: string | null;
    body: string | null;
    sourceFile: string | null;
  }) {
    if (document.kind === KnowledgeKind.FILE) {
      if (!document.sourceFile) throw new Error('Файл баримтад хадгалсан файл байхгүй');

      const extension = document.sourceFile.split('.').pop()?.toLowerCase() ?? '';
      if (!isKnowledgeFileExtension(extension)) {
        throw new Error(`Дэмжигдээгүй файлын төрөл: .${extension}`);
      }

      return extractFile({ extension, buffer: await this.storage.read(document.sourceFile) });
    }

    const body = document.body ?? '';
    const source = document.question ? `## ${document.question}\n\n${body}` : body;
    return extractMarkdown(source);
  }
}
