import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { DocumentStatus, Role } from '../../prisma/client.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { StorageService } from '../../storage/storage.service.js';
import type { CaseDocumentsService } from './case-documents.service.js';
import { DocumentFilesService } from './document-files.service.js';

const CLIENT = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;

/** A real PDF header — `assertAcceptable` sniffs the bytes, not the filename. */
const PDF = Buffer.from('255044462d312e340a25e2e3cfd30a', 'hex');
/** A real PNG header — a type the permissive template takes as it is. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
/** A GIF header: an image, but not one a PDF-only template converts. */
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'latin1');

function file(name: string, buffer: Buffer): Express.Multer.File {
  return { originalname: name, buffer, size: buffer.length, mimetype: 'application/octet-stream' } as Express.Multer.File;
}

function harness(options: { acceptedFileTypes?: string[]; maxVersion?: number | null } = {}) {
  const prisma = {
    caseDocument: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'doc-1',
        status: DocumentStatus.NOT_STARTED,
        deletedAt: null,
        template: { code: 'PASSPORT', acceptedFileTypes: options.acceptedFileTypes ?? ['pdf', 'jpg', 'png'] },
        case: { id: 'case-1', userId: 'student-1' },
      }),
    },
    documentFile: {
      findFirst: vi.fn().mockResolvedValue(options.maxVersion === undefined ? null : { version: options.maxVersion }),
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => data),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => data),
    },
    $transaction: vi.fn().mockImplementation((writes: unknown[]) => Promise.resolve(writes)),
  } as unknown as PrismaService;

  const storage = { upload: vi.fn().mockResolvedValue({ path: 'cases/case-1/PASSPORT/1-x.pdf' }) } as unknown as StorageService;
  const documents = {
    assertCaseAccess: vi.fn().mockResolvedValue(undefined),
    applyStatus: vi.fn().mockResolvedValue({}),
  } as unknown as CaseDocumentsService;

  return { service: new DocumentFilesService(prisma, storage, documents), prisma, storage, documents };
}

/**
 * 1N-24 — validation used to run inside the write loop, so a rejection on the
 * second file left the first one already in the bucket with the document's
 * status never advanced: bytes stored, nothing to show for them.
 */
describe('DocumentFilesService.upload — every buffer is judged before any is stored (1N-24)', () => {
  it('stores nothing when a later file in the batch is unacceptable', async () => {
    const { service, storage, documents } = harness({ acceptedFileTypes: ['pdf'] });

    await expect(service.upload('doc-1', [file('a.pdf', PDF), file('b.gif', GIF)], CLIENT)).rejects.toThrow(/зөвхөн pdf/);

    expect(storage.upload).not.toHaveBeenCalled();
    expect(documents.applyStatus).not.toHaveBeenCalled();
  });

  it('enforces the template`s own accepted list, judged on the real bytes', async () => {
    const { service } = harness({ acceptedFileTypes: ['pdf'] });

    await expect(service.upload('doc-1', [file('scan.pdf', GIF)], CLIENT)).rejects.toThrow(/зөвхөн pdf/);
  });

  it('accepts a type the template allows', async () => {
    const { service, storage, documents } = harness({ acceptedFileTypes: ['pdf', 'png'] });

    await service.upload('doc-1', [file('a.pdf', PDF), file('b.png', PNG)], CLIENT);

    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(documents.applyStatus).toHaveBeenCalledWith('doc-1', DocumentStatus.NOT_STARTED, DocumentStatus.SUBMITTED, 'student-1', null);
  });

  it('writes the versions as one batch, numbered on from the high-water mark', async () => {
    const { service, prisma } = harness({ maxVersion: 4 });

    await service.upload('doc-1', [file('a.pdf', PDF), file('b.pdf', PDF)], CLIENT);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const calls = (prisma.documentFile.create as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      { data: { version: number } },
    ][];
    const versions = calls.map((call) => call[0].data.version);
    expect(versions).toEqual([5, 6]);
  });

  it('re-reads and retries when another upload claimed the version first', async () => {
    const { service, prisma } = harness({ maxVersion: 4 });
    const collision = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    (prisma.$transaction as unknown as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(collision)
      .mockImplementationOnce((writes: unknown[]) => Promise.resolve(writes));

    await expect(service.upload('doc-1', [file('a.pdf', PDF)], CLIENT)).resolves.toBeDefined();

    // The retry re-reads the high-water mark rather than reusing the stale one.
    expect(prisma.documentFile.findFirst).toHaveBeenCalledTimes(2);
  });
});

/**
 * 1D-26 — both staff screens asked for `isFinal=true` on every upload, and
 * `isFinal` skips the submission. So an officer scanning the paper a client
 * had just handed over stored the file and left the row at "Эхлээгүй", where
 * the card offers no review buttons: collected in the office, invisible here.
 */
describe('DocumentFilesService.upload — a scan of a paper just handed in is not the final copy (1D-26)', () => {
  const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;

  it('submits the document even though staff asked for isFinal', async () => {
    const { service, prisma, documents } = harness();

    await service.upload('doc-1', [file('passport.pdf', PDF)], STAFF, { isFinal: true });

    expect(documents.applyStatus).toHaveBeenCalledWith(
      'doc-1',
      DocumentStatus.NOT_STARTED,
      DocumentStatus.SUBMITTED,
      'staff-1',
      null,
    );
    expect(prisma.documentFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFinal: false }) }),
    );
  });

  it('still marks the certified copy final once the document is past review', async () => {
    const { service, prisma, documents } = harness();
    (prisma.caseDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.IN_TRANSLATION,
      deletedAt: null,
      template: { code: 'PASSPORT', acceptedFileTypes: ['pdf'] },
      case: { id: 'case-1', userId: 'student-1' },
    });

    await service.upload('doc-1', [file('translated.pdf', PDF)], STAFF, { isFinal: true });

    expect(prisma.documentFile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isFinal: true }) }),
    );
    expect(documents.applyStatus).not.toHaveBeenCalled();
  });
});

/** A real photo, so the conversion runs on bytes `sharp` can decode. */
function photo(format: 'jpeg' | 'png', width = 300, height = 200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#d0d8e0' } })[format]().toBuffer();
}

function stored(prisma: PrismaService) {
  const calls = (prisma.documentFile.create as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    { data: { originalName: string; mimeType: string; sizeBytes: number } },
  ][];
  return calls.map((call) => call[0].data);
}

/**
 * 1D-32 — every material is kept as a PDF, and most clients send a phone
 * photo. Refusing it meant a client with no scanner app never uploaded at all.
 */
describe('DocumentFilesService.upload — photos for a PDF-only template become one PDF (1D-32)', () => {
  it('turns every photo of an upload into one PDF, beside the PDFs sent as they are', async () => {
    const { service, prisma, storage } = harness({ acceptedFileTypes: ['pdf'] });

    await service.upload(
      'doc-1',
      [file('IMG_0001.jpg', await photo('jpeg')), file('a.pdf', PDF), file('IMG_0002.PNG', await photo('png'))],
      CLIENT,
    );

    // The two photos are one version, at the place of the first.
    expect(stored(prisma).map((row) => [row.originalName, row.mimeType])).toEqual([
      ['IMG_0001.pdf', 'application/pdf'],
      ['a.pdf', 'application/pdf'],
    ]);
    const uploads = (storage.upload as unknown as ReturnType<typeof vi.fn>).mock.calls as [{ buffer: Buffer }][];
    const merged = uploads[0]![0].buffer;
    expect(merged.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(merged.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
    expect(stored(prisma)[0]!.sizeBytes).toBe(merged.byteLength);
  });

  it('refuses a photo it cannot decode before anything is stored', async () => {
    const { service, storage } = harness({ acceptedFileTypes: ['pdf'] });

    await expect(service.upload('doc-1', [file('a.pdf', PDF), file('broken.png', PNG)], CLIENT)).rejects.toThrow(
      /PDF болгож чадсангүй/,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('keeps the picture as it is when the template still takes images', async () => {
    const { service, prisma } = harness({ acceptedFileTypes: ['pdf', 'jpg'] });

    await service.upload('doc-1', [file('photo-3x4.jpg', await photo('jpeg'))], CLIENT);

    expect(stored(prisma).map((row) => [row.originalName, row.mimeType])).toEqual([['photo-3x4.jpg', 'image/jpeg']]);
  });
});

/**
 * 1D-31 — only staff delete a file (the route carries the role). The last file
 * of a document already handed in is withdrawn through RETURN, which tells the
 * client why; deleting it here would leave the row with nothing behind it.
 */
describe('DocumentFilesService.remove — the last file of a handed-in document goes through RETURN (1D-31)', () => {
  const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;

  function withFile(prisma: PrismaService, status: DocumentStatus, others: number) {
    (prisma.documentFile.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'file-1',
      caseDocumentId: 'doc-1',
      deletedAt: null,
      caseDocument: { caseId: 'case-1', status },
    });
    (prisma.documentFile.count as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(others);
  }

  it('refuses the only file of a submitted document', async () => {
    const { service, prisma } = harness();
    withFile(prisma, DocumentStatus.SUBMITTED, 0);

    await expect(service.remove('file-1', STAFF)).rejects.toThrow(/Хасаад дахин авах/);
    expect(prisma.documentFile.update).not.toHaveBeenCalled();
  });

  it('soft-deletes one of several files of an accepted document', async () => {
    const { service, prisma } = harness();
    withFile(prisma, DocumentStatus.ACCEPTED, 1);

    await service.remove('file-1', STAFF);

    expect(prisma.documentFile.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'file-1' }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
  });

  it('lets the last file go while the document is still waiting for a submission', async () => {
    const { service, prisma } = harness();
    withFile(prisma, DocumentStatus.RESUBMIT_REQUIRED, 0);

    await service.remove('file-1', STAFF);

    expect(prisma.documentFile.count).not.toHaveBeenCalled();
    expect(prisma.documentFile.update).toHaveBeenCalled();
  });
});
