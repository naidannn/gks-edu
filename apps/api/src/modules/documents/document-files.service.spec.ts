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
/** A real PNG header, for a template that only accepts PDFs. */
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

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

    await expect(service.upload('doc-1', [file('a.pdf', PDF), file('b.png', PNG)], CLIENT)).rejects.toThrow(/зөвхөн pdf/);

    expect(storage.upload).not.toHaveBeenCalled();
    expect(documents.applyStatus).not.toHaveBeenCalled();
  });

  it('enforces the template`s own accepted list, judged on the real bytes', async () => {
    const { service } = harness({ acceptedFileTypes: ['pdf'] });

    await expect(service.upload('doc-1', [file('scan.pdf', PNG)], CLIENT)).rejects.toThrow(/зөвхөн pdf/);
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
