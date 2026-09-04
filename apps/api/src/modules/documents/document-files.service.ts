import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { isStaff } from '../../common/constants/roles.js';
import { DocumentStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { CaseDocumentsService } from './case-documents.service.js';

/** Statuses from which a new upload means "here is my (re)submission" (§7.2). */
const SUBMIT_FROM: readonly DocumentStatus[] = [
  DocumentStatus.NOT_STARTED,
  DocumentStatus.IN_PROGRESS,
  DocumentStatus.NEEDS_FIX,
  DocumentStatus.RESUBMIT_REQUIRED,
];

/**
 * 1D-08 — versioned uploads. Every submission is a new `DocumentFile` row, so a
 * correction never overwrites what staff already reviewed (§15.4); the bytes
 * themselves are validated and stored by `StorageService` (0-09, §9).
 */
@Injectable()
export class DocumentFilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly documents: CaseDocumentsService,
  ) {}

  async upload(
    caseDocumentId: string,
    files: Express.Multer.File[],
    actor: AuthenticatedUser,
    options: { isFinal?: boolean } = {},
  ) {
    if (!files?.length) throw new BadRequestException('Файл сонгоогүй байна');

    const doc = await this.prisma.caseDocument.findUnique({
      where: { id: caseDocumentId },
      include: { template: { select: { code: true } }, case: { select: { id: true, userId: true } } },
    });
    if (!doc || doc.deletedAt) throw new NotFoundException(`Материал ${caseDocumentId} олдсонгүй`);
    await this.documents.assertCaseAccess(doc.case.id, actor);

    // `isFinal` marks the certified copy staff produced — never a client upload.
    const isFinal = Boolean(options.isFinal) && isStaff(actor.role);

    const last = await this.prisma.documentFile.findFirst({
      where: { caseDocumentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    let version = (last?.version ?? 0) + 1;

    const created = [];
    for (const file of files) {
      const { path } = await this.storage.upload({ caseId: doc.case.id, docCode: doc.template.code, buffer: file.buffer });
      created.push(
        await this.prisma.documentFile.create({
          data: {
            caseDocumentId,
            version,
            path,
            originalName: sanitiseName(file.originalname),
            sizeBytes: file.size,
            mimeType: file.mimetype,
            isFinal,
            uploadedById: actor.id,
          },
        }),
      );
      version += 1;
    }

    // A client's upload advances the document; staff attaching a certified copy
    // must not silently reset a document they are mid-review on.
    if (!isFinal && SUBMIT_FROM.includes(doc.status)) {
      await this.documents.applyStatus(caseDocumentId, doc.status, DocumentStatus.SUBMITTED, actor.id, null);
    }

    return created;
  }

  /** Short-lived signed token (§9) — the only way file bytes are ever reached. */
  async signedUrl(fileId: string, actor: AuthenticatedUser) {
    const file = await this.prisma.documentFile.findUnique({
      where: { id: fileId },
      include: { caseDocument: { select: { caseId: true } } },
    });
    if (!file || file.deletedAt) throw new NotFoundException(`Файл ${fileId} олдсонгүй`);
    await this.documents.assertCaseAccess(file.caseDocument.caseId, actor);

    const signed = this.storage.sign(file.path);
    return { ...signed, originalName: file.originalName, mimeType: file.mimeType };
  }

  /** Soft delete — the contract-period retention rule forbids erasing bytes (§9). */
  async remove(fileId: string, actor: AuthenticatedUser) {
    const file = await this.prisma.documentFile.findUnique({
      where: { id: fileId },
      include: { caseDocument: { select: { caseId: true, status: true } } },
    });
    if (!file || file.deletedAt) throw new NotFoundException(`Файл ${fileId} олдсонгүй`);
    await this.documents.assertCaseAccess(file.caseDocument.caseId, actor);

    if (!isStaff(actor.role) && file.caseDocument.status !== DocumentStatus.SUBMITTED) {
      throw new BadRequestException('Шалгагдаж эхэлсэн материалын файлыг устгах боломжгүй');
    }
    return this.prisma.documentFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
  }
}

/** Keeps the client's filename readable without letting it steer a path. */
function sanitiseName(name: string): string {
  return name.replace(/[/\\]/g, '_').slice(0, 200) || 'file';
}
