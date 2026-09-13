import { Injectable, Logger } from '@nestjs/common';
import {
  FaqCategory,
  KnowledgeCategory,
  KnowledgeKind,
  KnowledgeStatus,
  PostStatus,
  AccessLevel,
} from '../../../prisma/client.js';
import { blocksToText, htmlToBlocks } from './extract/index.js';
import { IngestService } from './ingest.service.js';
import { KnowledgeService } from './knowledge.service.js';

/** What a published FAQ is about, in the knowledge base's own vocabulary. */
const FAQ_CATEGORY: Record<FaqCategory, KnowledgeCategory> = {
  GENERAL: KnowledgeCategory.FAQ,
  SERVICES: KnowledgeCategory.SERVICE,
  PRICING: KnowledgeCategory.PRICING,
  DOCUMENTS: KnowledgeCategory.DOCUMENTS,
  VISA: KnowledgeCategory.VISA,
  // The language centre is out of scope as a system (CLAUDE.md) but its FAQs are
  // on the public site, so the assistant should be able to answer from them.
  LANGUAGE_CENTER: KnowledgeCategory.SERVICE,
};

export interface FaqSource {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  isPublished: boolean;
}

export interface PostSource {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: PostStatus;
}

/**
 * Mirrors published site content into the knowledge base (2A-07).
 *
 * The reason this exists is that staff should write an answer once. A FAQ entry
 * and an article are already written, already reviewed and already public; if the
 * assistant could not read them, somebody would have to paste each one into the
 * knowledge base and then remember to edit both copies forever — and the copy
 * nobody remembers is the one that answers a visitor.
 *
 * Every mirrored row is keyed by `sourceRef` (`faq:<id>`, `post:<id>`), so a
 * fixed typo updates the existing document instead of adding a second one. The
 * mirror follows publication state both ways: unpublishing deletes the mirror,
 * because an article the office pulled down must stop being quoted.
 *
 * Mirrors are always `PUBLIC`. Anything behind a login or a contract is written
 * in the knowledge base itself, where its level is chosen deliberately.
 */
@Injectable()
export class ContentSyncService {
  private readonly logger = new Logger(ContentSyncService.name);

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly ingest: IngestService,
  ) {}

  async syncFaq(faq: FaqSource): Promise<void> {
    const sourceRef = `faq:${faq.id}`;

    if (!faq.isPublished) return this.remove(sourceRef);

    await this.mirror({
      sourceRef,
      title: faq.question,
      kind: KnowledgeKind.FAQ,
      category: FAQ_CATEGORY[faq.category],
      question: faq.question,
      body: faq.answer,
    });
  }

  async syncPost(post: PostSource): Promise<void> {
    const sourceRef = `post:${post.id}`;

    if (post.status !== PostStatus.PUBLISHED) return this.remove(sourceRef);

    // An article's body is sanitised HTML, so it goes through the same block
    // scanner the DOCX path uses and comes out as text with its headings marked.
    const body = [post.excerpt, blocksToText(htmlToBlocks(post.content))].filter(Boolean).join('\n\n');

    await this.mirror({
      sourceRef,
      title: post.title,
      kind: KnowledgeKind.POST,
      category: KnowledgeCategory.POLICY,
      question: null,
      body,
    });
  }

  async removeFaq(id: string): Promise<void> {
    await this.remove(`faq:${id}`);
  }

  async removePost(id: string): Promise<void> {
    await this.remove(`post:${id}`);
  }

  private async mirror(params: {
    sourceRef: string;
    title: string;
    kind: KnowledgeKind;
    category: KnowledgeCategory;
    question: string | null;
    body: string;
  }): Promise<void> {
    if (params.body.trim().length === 0) return this.remove(params.sourceRef);

    try {
      const document = await this.knowledge.upsertBySourceRef({
        sourceRef: params.sourceRef,
        title: params.title,
        kind: params.kind,
        category: params.category,
        accessLevel: AccessLevel.PUBLIC,
        status: KnowledgeStatus.PUBLISHED,
        question: params.question,
        body: params.body,
      });

      await this.ingest.enqueue(document.id);
    } catch (error) {
      // Content editing must never fail because the assistant's index is
      // unhappy. The mirror is caught up by `reindex-pending` (2A-05).
      this.logger.warn(
        `${params.sourceRef} мэдлэгийн санд тусгагдсангүй: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async remove(sourceRef: string): Promise<void> {
    try {
      await this.knowledge.deleteBySourceRef(sourceRef);
    } catch (error) {
      this.logger.warn(
        `${sourceRef} мэдлэгийн сангаас хасагдсангүй: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
