import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { isStaff } from '../../common/constants/roles.js';
import { DocumentStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { softDeletePatch } from '../../prisma/soft-delete.js';
import { StorageService } from '../../storage/storage.service.js';
import { CaseDocumentsService } from './case-documents.service.js';

/** Statuses from which a new upload means "here is my (re)submission" (§7.2). */
const SUBMIT_FROM: readonly DocumentStatus[] = [
  DocumentStatus.NOT_STARTED,
  DocumentStatus.IN_PROGRESS,
  DocumentStatus.NEEDS_FIX,
  DocumentStatus.RESUBMIT_REQUIRED,
];

/** How many times a version collision is worth re-reading the high-water mark. */
const VERSION_ATTEMPTS = 3;

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
      include: {
        template: { select: { code: true, acceptedFileTypes: true } },
        case: { select: { id: true, userId: true } },
      },
    });
    if (!doc || doc.deletedAt) throw new NotFoundException(`Материал ${caseDocumentId} олдсонгүй`);
    await this.documents.assertCaseAccess(doc.case.id, actor);

    // `isFinal` marks the certified copy staff produced — never a client upload.
    const isFinal = Boolean(options.isFinal) && isStaff(actor.role);

    // Every buffer is judged before a single byte is stored. Validating inside
    // the write loop meant a rejected second file left the first one in the
    // bucket with the document's status never advanced (1N-24).
    for (const file of files) {
      await this.assertAcceptable(file, doc.template.acceptedFileTypes);
    }

    const paths: string[] = [];
    for (const file of files) {
      const { path } = await this.storage.upload({ caseId: doc.case.id, docCode: doc.template.code, buffer: file.buffer });
      paths.push(path);
    }

    const created = await this.createVersions(caseDocumentId, files, paths, actor.id, isFinal);

    // A client's upload advances the document; staff attaching a certified copy
    // must not silently reset a document they are mid-review on.
    if (!isFinal && SUBMIT_FROM.includes(doc.status)) {
      await this.documents.applyStatus(caseDocumentId, doc.status, DocumentStatus.SUBMITTED, actor.id, null);
    }

    return created;
  }

  /**
   * `DocumentTemplate.acceptedFileTypes` is the template's own answer to "what
   * may I send for this?" — a passport scan as a Word file is not one. Judged
   * on the real bytes, never on the client-supplied name or header.
   */
  private async assertAcceptable(file: Express.Multer.File, accepted: string[]): Promise<void> {
    const sniffed = await fileTypeFromBuffer(file.buffer);
    if (!sniffed) throw new BadRequestException(`"${file.originalname}" файлын төрлийг таньж чадсангүй`);
    if (!accepted.length) return;

    const allowed = accepted.map((type) => type.toLowerCase().replace(/^\./, ''));
    // `file-type` reports a JPEG as `jpg`; templates are written either way.
    const ext = sniffed.ext === 'jpg' ? ['jpg', 'jpeg'] : [sniffed.ext];
    if (!ext.some((candidate) => allowed.includes(candidate))) {
      throw new BadRequestException(`Энэ материалыг зөвхөн ${allowed.join(', ')} хэлбэрээр хүлээн авна`);
    }
  }

  /**
   * Two uploads racing read the same high-water mark and one of them violates
   * `@@unique([caseDocumentId, version])` — a 500 *after* the bytes are already
   * stored. Re-read and retry instead; the rows go in as one batch, so a
   * multi-file upload is never half-recorded.
   */
  private async createVersions(
    caseDocumentId: string,
    files: Express.Multer.File[],
    paths: string[],
    uploadedById: string,
    isFinal: boolean,
  ) {
    for (let attempt = 0; attempt < VERSION_ATTEMPTS; attempt += 1) {
      const last = await this.prisma.documentFile.findFirst({
        where: { caseDocumentId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const base = (last?.version ?? 0) + 1;

      try {
        return await this.prisma.$transaction(
          files.map((file, index) =>
            this.prisma.documentFile.create({
              data: {
                caseDocumentId,
                version: base + index,
                path: paths[index]!,
                originalName: sanitiseName(file.originalname),
                sizeBytes: file.size,
                mimeType: file.mimetype,
                isFinal,
                uploadedById,
              },
            }),
          ),
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new ConflictException('Файл хадгалахад зөрчил гарлаа — дахин оролдоно уу');
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
    return this.prisma.documentFile.update({ where: { id: fileId }, data: softDeletePatch() });
  }
}

/** Someone else claimed this version number between our read and our write. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** Keeps the client's filename readable without letting it steer a path. */
function sanitiseName(name: string): string {
  return name.replace(/[/\\]/g, '_').slice(0, 200) || 'file';
}
