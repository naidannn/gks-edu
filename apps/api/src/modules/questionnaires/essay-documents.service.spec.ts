import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { EssayDocumentKind, EssayDocumentStatus, Role, ServiceType } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { EssayDocumentsService, plainText } from './essay-documents.service.js';

const OWNER = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;
const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;
const PS = EssayDocumentKind.PERSONAL_STATEMENT;

function harness(document: Record<string, unknown> | null = null) {
  const gksCase = {
    id: 'case-1',
    userId: OWNER.id,
    serviceType: ServiceType.GKS_SCHOLARSHIP,
    program: null,
    intake: null,
    conditions: null,
    user: { name: 'Bold', client: { lastName: 'Бат', firstName: 'Болд' } },
  };
  const row = document && {
    id: 'doc-1',
    caseId: 'case-1',
    kind: PS,
    html: '<p>I am Bold.</p>',
    status: EssayDocumentStatus.DRAFT,
    version: 3,
    sharedAt: null,
    approvedAt: null,
    updatedAt: new Date(),
    editedBy: { name: 'Writer' },
    comments: [
      { id: 'c-1', body: 'Нэмэх үү?', quote: 'Bold', authorId: OWNER.id, author: { id: OWNER.id, name: 'Bold', role: Role.USER }, createdAt: new Date(), resolvedAt: null },
    ],
    ...document,
  };
  const withData = ({ data }: { data: Record<string, unknown> }) => ({ ...row, ...data, comments: row?.comments ?? [] });
  const prisma = {
    case: { findUnique: vi.fn().mockResolvedValue(gksCase) },
    essayDocument: {
      findMany: vi.fn().mockResolvedValue(row ? [row] : []),
      findUnique: vi.fn().mockResolvedValue(row),
      findUniqueOrThrow: vi.fn().mockResolvedValue(row),
      create: vi.fn().mockImplementation(withData),
      update: vi.fn().mockImplementation(withData),
    },
    essayDocumentComment: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue({ id: 'c-1', documentId: 'doc-1' }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  return { prisma, service: new EssayDocumentsService(prisma as unknown as PrismaService) };
}

describe('EssayDocumentsService (1D-28)', () => {
  it('lists both essays, and a draft shows the client its status but not its words', async () => {
    const { service } = harness({});
    const view = await service.list('case-1', OWNER);
    expect(view.documents.map((doc) => doc.kind)).toEqual([EssayDocumentKind.PERSONAL_STATEMENT, EssayDocumentKind.STUDY_PLAN]);
    expect(view.documents[0]).toMatchObject({ status: 'DRAFT', html: '', comments: [], editedByName: null });
    expect(view.documents[1]).toMatchObject({ status: 'DRAFT', version: 0 });
  });

  it('shows a shared essay and its comments to the client', async () => {
    const { service } = harness({ status: EssayDocumentStatus.SHARED });
    const [ps] = (await service.list('case-1', OWNER)).documents;
    expect(ps?.html).toBe('<p>I am Bold.</p>');
    expect(ps?.comments[0]).toMatchObject({ body: 'Нэмэх үү?', quote: 'Bold', fromStaff: false });
  });

  it('only staff write the essay', async () => {
    const { service } = harness({});
    await expect(service.save('case-1', PS, { html: '<p>x</p>', baseVersion: 3 }, OWNER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates the essay on its first save at version 1', async () => {
    const { prisma, service } = harness(null);
    const view = await service.save('case-1', PS, { html: '<p>Hello</p>', baseVersion: 0 }, STAFF);
    expect(prisma.essayDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ html: '<p>Hello</p>', version: 1, editedById: STAFF.id }) }),
    );
    expect(view.status).toBe('DRAFT');
  });

  it('saves against the version the editor loaded, and a stale one is a conflict', async () => {
    const { prisma, service } = harness({});
    await service.save('case-1', PS, { html: '<p>v4</p>', baseVersion: 3 }, STAFF);
    expect(prisma.essayDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1', version: 3 }, data: expect.objectContaining({ version: { increment: 1 } }) }),
    );

    prisma.essayDocument.update.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'P2025' }));
    await expect(service.save('case-1', PS, { html: '<p>old</p>', baseVersion: 2 }, STAFF)).rejects.toBeInstanceOf(ConflictException);
  });

  it('a new essay created by somebody else in the meantime is a conflict too', async () => {
    const { service } = harness(null);
    await expect(service.save('case-1', PS, { html: '<p>x</p>', baseVersion: 5 }, STAFF)).rejects.toBeInstanceOf(ConflictException);
  });

  it('editing an approved essay asks the client to approve it again', async () => {
    const { prisma, service } = harness({ status: EssayDocumentStatus.APPROVED, approvedAt: new Date() });
    await service.save('case-1', PS, { html: '<p>changed</p>', baseVersion: 3 }, STAFF);
    expect(prisma.essayDocument.update.mock.calls[0]?.[0].data).toMatchObject({ status: 'SHARED', approvedAt: null });
  });

  it('refuses to share an empty essay', async () => {
    const { service } = harness({ html: '<p></p>' });
    await expect(service.setStatus('case-1', PS, { status: EssayDocumentStatus.SHARED }, STAFF)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the client approves a shared essay; staff cannot approve for them', async () => {
    const { prisma, service } = harness({ status: EssayDocumentStatus.SHARED });
    await expect(service.setStatus('case-1', PS, { status: EssayDocumentStatus.APPROVED }, STAFF)).rejects.toBeInstanceOf(ForbiddenException);
    const view = await service.setStatus('case-1', PS, { status: EssayDocumentStatus.APPROVED }, OWNER);
    expect(view.status).toBe('APPROVED');
    expect(prisma.essayDocument.update.mock.calls[0]?.[0].data.approvedAt).toBeInstanceOf(Date);
  });

  it('the client can neither approve nor comment on a draft they cannot see', async () => {
    const { service } = harness({});
    await expect(service.setStatus('case-1', PS, { status: EssayDocumentStatus.APPROVED }, OWNER)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addComment('case-1', PS, { body: 'hi' }, OWNER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the client cannot hide or share an essay', async () => {
    const { service } = harness({ status: EssayDocumentStatus.SHARED });
    await expect(service.setStatus('case-1', PS, { status: EssayDocumentStatus.DRAFT }, OWNER)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('stores a comment with the passage it quotes', async () => {
    const { prisma, service } = harness({ status: EssayDocumentStatus.SHARED });
    await service.addComment('case-1', PS, { body: '  Энд нэмье  ', quote: ' I am Bold. ' }, OWNER);
    expect(prisma.essayDocumentComment.create).toHaveBeenCalledWith({
      data: { documentId: 'doc-1', authorId: OWNER.id, body: 'Энд нэмье', quote: 'I am Bold.' },
    });
  });

  it('only staff resolve a comment', async () => {
    const { prisma, service } = harness({ status: EssayDocumentStatus.SHARED });
    await expect(service.resolveComment('case-1', PS, 'c-1', { resolved: true }, OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    await service.resolveComment('case-1', PS, 'c-1', { resolved: true }, STAFF);
    expect(prisma.essayDocumentComment.update.mock.calls[0]?.[0].data).toMatchObject({ resolvedById: STAFF.id });
  });

  it('plainText sees through empty editor markup', () => {
    expect(plainText('<p></p><p>&nbsp;</p>')).toBe('');
    expect(plainText('<h2>Goal</h2><p>To study</p>')).toBe('Goal To study');
  });
});
