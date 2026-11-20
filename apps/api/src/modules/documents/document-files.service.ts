import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { isStaff } from '../../common/constants/roles.js';
import { DocumentStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NOT_DELETED, softDeletePatch } from '../../prisma/soft-delete.js';
import { StorageService } from '../../storage/storage.service.js';
import { CaseDocumentsService } from './case-documents.service.js';
import { AWAITING_SUBMISSION } from './document-status.js';
import { CONVERTIBLE_IMAGE_EXTENSIONS, imagesToPdf } from './image-to-pdf.js';

/** How many times a version collision is worth re-reading the high-water mark. */
const VERSION_ATTEMPTS = 3;

/** One version as it will be stored — the client's file, or the PDF its photos became (1D-32). */
interface PreparedFile {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
}

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

    // `isFinal` marks the certified copy staff produced — never a client
    // upload, and never a document still waiting to be handed in. The staff
    // screens asked for `isFinal=true` unconditionally, so scanning a paper a
    // client brought to the desk stored the file, skipped the submission and
    // left the row at "Эхлээгүй" with no way to accept it (1D-26).
    const isFinal = Boolean(options.isFinal) && isStaff(actor.role) && !AWAITING_SUBMISSION.includes(doc.status);

    // Every buffer is judged — and every photo converted — before a single
    // byte is stored. Validating inside the write loop meant a rejected second
    // file left the first one in the bucket with the document's status never
    // advanced (1N-24).
    const prepared = await this.prepare(files, doc.template.acceptedFileTypes);

    const paths: string[] = [];
    for (const file of prepared) {
      const { path } = await this.storage.upload({ caseId: doc.case.id, docCode: doc.template.code, buffer: file.buffer });
      paths.push(path);
    }

    const created = await this.createVersions(caseDocumentId, prepared, paths, actor.id, isFinal);

    // A client's upload advances the document; staff attaching a certified copy
    // must not silently reset a document they are mid-review on.
    if (!isFinal && AWAITING_SUBMISSION.includes(doc.status)) {
      await this.documents.applyStatus(caseDocumentId, doc.status, DocumentStatus.SUBMITTED, actor.id, null);
    }

    return created;
  }

  /**
   * `DocumentTemplate.acceptedFileTypes` is the template's own answer to "what
   * may I send for this?" — a passport scan as a Word file is not one. Judged
   * on the real bytes, never on the client-supplied name or header.
   *
   * A photo sent for a template that takes PDF but not that image type is not
   * refused: every such photo in the upload becomes one PDF, in the order they
   * were picked, at the position of the first (1D-32). A template that still
   * lists `jpg` keeps the picture as it is.
   */
  private async prepare(files: Express.Multer.File[], accepted: string[]): Promise<PreparedFile[]> {
    const allowed = accepted.map((type) => type.toLowerCase().replace(/^\./, ''));
    const prepared: (PreparedFile | 'photos')[] = [];
    const photos: { buffer: Buffer; name: string }[] = [];

    for (const file of files) {
      const sniffed = await fileTypeFromBuffer(file.buffer);
      if (!sniffed) throw new BadRequestException(`"${file.originalname}" файлын төрлийг таньж чадсангүй`);

      const kept = { buffer: file.buffer, originalName: sanitiseName(file.originalname), mimeType: sniffed.mime };
      // `file-type` reports a JPEG as `jpg`; templates are written either way.
      const ext = sniffed.ext === 'jpg' ? ['jpg', 'jpeg'] : [sniffed.ext];
      if (!allowed.length || ext.some((candidate) => allowed.includes(candidate))) {
        prepared.push(kept);
      } else if (allowed.includes('pdf') && CONVERTIBLE_IMAGE_EXTENSIONS.includes(sniffed.ext)) {
        if (!photos.length) prepared.push('photos');
        photos.push({ buffer: file.buffer, name: file.originalname });
      } else {
        const photoHint = allowed.includes('pdf') ? ' (JPG, PNG зураг автоматаар PDF болно)' : '';
        throw new BadRequestException(`Энэ материалыг зөвхөн ${allowed.join(', ')} хэлбэрээр хүлээн авна${photoHint}`);
      }
    }

    if (!photos.length) return prepared as PreparedFile[];
    const pdf: PreparedFile = {
      buffer: await imagesToPdf(photos),
      originalName: pdfName(photos[0]!.name),
      mimeType: 'application/pdf',
    };
    return prepared.map((item) => (item === 'photos' ? pdf : item));
  }

  /**
   * Two uploads racing read the same high-water mark and one of them violates
   * `@@unique([caseDocumentId, version])` — a 500 *after* the bytes are already
   * stored. Re-read and retry instead; the rows go in as one batch, so a
   * multi-file upload is never half-recorded.
   */
  private async createVersions(
    caseDocumentId: string,
    files: PreparedFile[],
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
                originalName: file.originalName,
                sizeBytes: file.buffer.byteLength,
                mimeType: file.mimeType,
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

  /**
   * Soft delete — the contract-period retention rule forbids erasing bytes (§9).
   * Staff only (1D-31, the route carries the role); a client corrects a file by
   * uploading the next version.
   *
   * The last file of a document already handed in is not deleted this way: the
   * row would sit in the review queue, or stay "accepted", with nothing behind
   * it and the client never told. "Хасаад дахин авах" withdraws it, puts the
   * document back on the client's list and emails them why.
   */
  async remove(fileId: string, actor: AuthenticatedUser) {
    const file = await this.prisma.documentFile.findUnique({
      where: { id: fileId },
      include: { caseDocument: { select: { caseId: true, status: true } } },
    });
    if (!file || file.deletedAt) throw new NotFoundException(`Файл ${fileId} олдсонгүй`);
    await this.documents.assertCaseAccess(file.caseDocument.caseId, actor);

    if (!AWAITING_SUBMISSION.includes(file.caseDocument.status)) {
      const others = await this.prisma.documentFile.count({
        where: { caseDocumentId: file.caseDocumentId, ...NOT_DELETED, id: { not: fileId } },
      });
      if (others === 0) {
        throw new BadRequestException(
          'Энэ материалын сүүлийн файл байна — «Хасаад дахин авах»-аар буцаана уу, үйлчлүүлэгчид шалтгаан нь очно',
        );
      }
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

/** "IMG_2041.jpg" → "IMG_2041.pdf": the photo's own name, so the client recognises it. */
function pdfName(photoName: string): string {
  const base = sanitiseName(photoName).replace(/\.[a-z0-9]{2,5}$/i, '');
  return `${base.slice(0, 190) || 'file'}.pdf`;
}
