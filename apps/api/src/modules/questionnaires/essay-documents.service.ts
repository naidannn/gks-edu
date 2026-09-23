import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { EssayDocumentKind, EssayDocumentStatus, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AddEssayCommentDto,
  ResolveEssayCommentDto,
  SaveEssayDocumentDto,
  SetEssayDocumentStatusDto,
} from './dto/questionnaire.dto.js';
import { loadQuestionnaireCase } from './questionnaire-case.js';

export const ESSAY_DOCUMENT_KINDS = [EssayDocumentKind.PERSONAL_STATEMENT, EssayDocumentKind.STUDY_PLAN] as const;

const documentInclude = {
  editedBy: { select: { name: true } },
  comments: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
} satisfies Prisma.EssayDocumentInclude;

type DocumentRow = Prisma.EssayDocumentGetPayload<{ include: typeof documentInclude }>;

/** A client sees an essay only once staff have shown it to them. */
const visibleToClient = (status: EssayDocumentStatus) => status !== EssayDocumentStatus.DRAFT;

/**
 * The Personal Statement and Study Plan, written in the system (1D-28).
 *
 * Before this the writer copied the questionnaire into Word, wrote there, and
 * uploaded the file; every round of the client's remarks meant download, edit,
 * upload again. Now the essay is one row the writer edits in place, the client
 * reads the same row once it is shared, and remarks are comments on it.
 */
@Injectable()
export class EssayDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(caseId: string, actor: AuthenticatedUser) {
    const gksCase = await loadQuestionnaireCase(this.prisma, caseId, actor);
    const rows = await this.prisma.essayDocument.findMany({ where: { caseId }, include: documentInclude });
    const staff = isStaff(actor.role);
    return {
      applicantName: gksCase.applicantName,
      documents: ESSAY_DOCUMENT_KINDS.map((kind) => this.view(kind, rows.find((row) => row.kind === kind) ?? null, staff)),
    };
  }

  /**
   * Autosave of the writer's editor. `baseVersion` is the version the editor
   * loaded; if somebody else saved since, this is a 409 rather than a quiet
   * overwrite of their paragraph.
   */
  async save(caseId: string, kind: EssayDocumentKind, dto: SaveEssayDocumentDto, actor: AuthenticatedUser) {
    assertStaff(actor);
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const existing = await this.prisma.essayDocument.findUnique({ where: { caseId_kind: { caseId, kind } } });

    if (!existing) {
      if (dto.baseVersion !== 0) throw conflict();
      try {
        const row = await this.prisma.essayDocument.create({
          data: { caseId, kind, html: dto.html, version: 1, editedById: actor.id },
          include: documentInclude,
        });
        return this.view(kind, row, true);
      } catch (error) {
        if (prismaCode(error) === 'P2002') throw conflict();
        throw error;
      }
    }

    // An approved essay that changes needs approving again.
    const reapprove = existing.status === EssayDocumentStatus.APPROVED && existing.html !== dto.html;
    try {
      const row = await this.prisma.essayDocument.update({
        where: { id: existing.id, version: dto.baseVersion },
        data: {
          html: dto.html,
          version: { increment: 1 },
          editedById: actor.id,
          ...(reapprove ? { status: EssayDocumentStatus.SHARED, approvedAt: null } : {}),
        },
        include: documentInclude,
      });
      return this.view(kind, row, true);
    } catch (error) {
      if (prismaCode(error) === 'P2025') throw conflict();
      throw error;
    }
  }

  /** Staff show or hide the essay; the client approves a shown one. */
  async setStatus(caseId: string, kind: EssayDocumentKind, dto: SetEssayDocumentStatusDto, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const staff = isStaff(actor.role);
    const existing = await this.prisma.essayDocument.findUnique({ where: { caseId_kind: { caseId, kind } } });
    if (!existing || (!staff && !visibleToClient(existing.status))) throw new NotFoundException('Эссэ хараахан бэлэн болоогүй байна');

    let data: Prisma.EssayDocumentUpdateInput;
    if (dto.status === EssayDocumentStatus.APPROVED) {
      if (staff) throw new ForbiddenException('Эссэг үйлчлүүлэгч өөрөө баталгаажуулна');
      if (existing.status === EssayDocumentStatus.APPROVED) return this.reload(existing.id, kind, staff);
      data = { status: EssayDocumentStatus.APPROVED, approvedAt: new Date() };
    } else {
      assertStaff(actor);
      if (dto.status === EssayDocumentStatus.SHARED) {
        if (!plainText(existing.html)) throw new BadRequestException('Хоосон эссэг үйлчлүүлэгчид харуулах боломжгүй');
        if (existing.status !== EssayDocumentStatus.DRAFT) return this.reload(existing.id, kind, staff);
        data = { status: EssayDocumentStatus.SHARED, sharedAt: new Date() };
      } else {
        data = { status: EssayDocumentStatus.DRAFT, approvedAt: null };
      }
    }

    const row = await this.prisma.essayDocument.update({ where: { id: existing.id }, data, include: documentInclude });
    return this.view(kind, row, staff);
  }

  async addComment(caseId: string, kind: EssayDocumentKind, dto: AddEssayCommentDto, actor: AuthenticatedUser) {
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const staff = isStaff(actor.role);
    const existing = await this.prisma.essayDocument.findUnique({ where: { caseId_kind: { caseId, kind } } });
    if (!existing || (!staff && !visibleToClient(existing.status))) throw new NotFoundException('Эссэ хараахан бэлэн болоогүй байна');

    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Сэтгэгдлээ бичнэ үү');
    await this.prisma.essayDocumentComment.create({
      data: { documentId: existing.id, authorId: actor.id, body, quote: dto.quote?.trim() || null },
    });
    return this.reload(existing.id, kind, staff);
  }

  async resolveComment(
    caseId: string,
    kind: EssayDocumentKind,
    commentId: string,
    dto: ResolveEssayCommentDto,
    actor: AuthenticatedUser,
  ) {
    assertStaff(actor);
    await loadQuestionnaireCase(this.prisma, caseId, actor);
    const comment = await this.prisma.essayDocumentComment.findFirst({
      where: { id: commentId, document: { caseId, kind } },
      select: { id: true, documentId: true },
    });
    if (!comment) throw new NotFoundException('Сэтгэгдэл олдсонгүй');
    await this.prisma.essayDocumentComment.update({
      where: { id: comment.id },
      data: dto.resolved ? { resolvedAt: new Date(), resolvedById: actor.id } : { resolvedAt: null, resolvedById: null },
    });
    return this.reload(comment.documentId, kind, true);
  }

  private async reload(id: string, kind: EssayDocumentKind, staff: boolean) {
    const row = await this.prisma.essayDocument.findUniqueOrThrow({ where: { id }, include: documentInclude });
    return this.view(kind, row, staff);
  }

  private view(kind: EssayDocumentKind, row: DocumentRow | null, staff: boolean) {
    const hidden = !row || (!staff && !visibleToClient(row.status));
    return {
      kind,
      status: row?.status ?? EssayDocumentStatus.DRAFT,
      // A draft is the writer's business: the client gets its status, not its words.
      html: hidden ? '' : row.html,
      version: row?.version ?? 0,
      sharedAt: row?.sharedAt ?? null,
      approvedAt: row?.approvedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      editedByName: staff ? (row?.editedBy?.name ?? null) : null,
      comments: hidden
        ? []
        : row.comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            quote: comment.quote,
            authorName: comment.author?.name ?? null,
            fromStaff: comment.author ? isStaff(comment.author.role) : false,
            createdAt: comment.createdAt,
            resolvedAt: comment.resolvedAt,
          })),
    };
  }
}

function assertStaff(actor: AuthenticatedUser) {
  if (!isStaff(actor.role)) throw new ForbiddenException('Эссэг зөвхөн ажилтан бичнэ');
}

function conflict() {
  return new ConflictException('Энэ эссэг өөр ажилтан саяхан зассан байна. Хуудсаа дахин ачаалж, сүүлийн хувилбар дээр үргэлжлүүлнэ үү.');
}

function prismaCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
}

/** The words of an editor's HTML — enough to tell an empty `<p></p>` from an essay. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
