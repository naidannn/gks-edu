import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessLevel, FaqCategory, KnowledgeCategory, KnowledgeKind, PostStatus } from '../../../prisma/client.js';
import { ContentSyncService } from './content-sync.service.js';
import type { IngestService } from './ingest.service.js';
import type { KnowledgeService } from './knowledge.service.js';

function harness() {
  const knowledge = {
    upsertBySourceRef: vi.fn().mockResolvedValue({ id: 'doc-1' }),
    deleteBySourceRef: vi.fn().mockResolvedValue(undefined),
  } as unknown as KnowledgeService;
  const ingest = { enqueue: vi.fn().mockResolvedValue(undefined) } as unknown as IngestService;

  return { service: new ContentSyncService(knowledge, ingest), knowledge, ingest };
}

const faq = {
  id: 'faq-1',
  category: FaqCategory.PRICING,
  question: 'Зуучлалын төлбөр хэрхэн хуваагддаг вэ?',
  answer: 'Урьдчилгаа гэрээ байгуулахад, үлдэгдэл нь үйлчилгээнээсээ хамаарч виз эсвэл хариуны дараа.',
  isPublished: true,
};

const post = {
  id: 'post-1',
  slug: 'gks-2027',
  title: 'GKS 2027: юу өөрчлөгдөв',
  excerpt: 'Хураангуй мөр.',
  content: '<h2>Шалгуур</h2><p>Насны шаардлага <strong>хэвээр</strong>.</p><ul><li>Диплом</li></ul>',
  status: PostStatus.PUBLISHED,
};

describe('ContentSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mirrors a published FAQ, keyed so an edit updates it instead of duplicating', async () => {
    const { service, knowledge, ingest } = harness();

    await service.syncFaq(faq);

    expect(knowledge.upsertBySourceRef).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRef: 'faq:faq-1',
        kind: KnowledgeKind.FAQ,
        category: KnowledgeCategory.PRICING,
        accessLevel: AccessLevel.PUBLIC,
        question: faq.question,
      }),
    );
    expect(ingest.enqueue).toHaveBeenCalledWith('doc-1');
  });

  it('removes the mirror when a FAQ is unpublished', async () => {
    const { service, knowledge } = harness();

    await service.syncFaq({ ...faq, isPublished: false });

    expect(knowledge.deleteBySourceRef).toHaveBeenCalledWith('faq:faq-1');
    expect(knowledge.upsertBySourceRef).not.toHaveBeenCalled();
  });

  it('turns an article’s HTML into text with its headings kept', async () => {
    const { service, knowledge } = harness();

    await service.syncPost(post);

    const { body, question, kind } = vi.mocked(knowledge.upsertBySourceRef).mock.calls[0]![0];
    expect(kind).toBe(KnowledgeKind.POST);
    expect(question).toBeNull();
    expect(body).toContain('## Шалгуур');
    // Inline markup is dropped without eating the words it wrapped.
    expect(body).toContain('Насны шаардлага хэвээр.');
    expect(body).toContain('Диплом');
    expect(body).not.toContain('<');
    // The excerpt leads, because it is the summary a human already wrote.
    expect(body!.startsWith('Хураангуй мөр.')).toBe(true);
  });

  it('removes the mirror of an article that went back to draft', async () => {
    const { service, knowledge } = harness();

    await service.syncPost({ ...post, status: PostStatus.DRAFT });

    expect(knowledge.deleteBySourceRef).toHaveBeenCalledWith('post:post-1');
  });

  it('removes rather than mirrors an article with no readable text', async () => {
    const { service, knowledge } = harness();

    await service.syncPost({ ...post, excerpt: null, content: '<p></p>' });

    expect(knowledge.deleteBySourceRef).toHaveBeenCalledWith('post:post-1');
    expect(knowledge.upsertBySourceRef).not.toHaveBeenCalled();
  });

  it('never fails a content edit because the index is unhappy', async () => {
    const { service, knowledge } = harness();
    vi.mocked(knowledge.upsertBySourceRef).mockRejectedValue(new Error('pooler is down'));

    await expect(service.syncFaq(faq)).resolves.toBeUndefined();
  });
});
