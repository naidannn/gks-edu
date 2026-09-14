import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { S3StorageDriver } from './s3-storage.driver.js';

const send = vi.fn();

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  // A class, not an arrow: the driver calls `new S3Client(...)`.
  return {
    ...actual,
    S3Client: class {
      send = send;
    },
  };
});

const CONFIG: Record<string, string> = {
  'storage.s3Bucket': 'gksedu-files',
  'storage.s3Region': 'ap-southeast-1',
  'storage.s3AccessKeyId': 'AKIAEXAMPLE',
  'storage.s3SecretAccessKey': 'secret',
};

function driver(): S3StorageDriver {
  const config = {
    get: (key: string) => CONFIG[key],
    getOrThrow: (key: string) => {
      const value = CONFIG[key];
      if (value === undefined) throw new Error(`missing ${key}`);
      return value;
    },
  } as unknown as ConfigService;
  return new S3StorageDriver(config);
}

/** The command objects the driver sent, in order, as [name, input] pairs. */
function sentCommands(): [string, Record<string, unknown>][] {
  return send.mock.calls.map(([command]) => [command.constructor.name, command.input]);
}

describe('S3StorageDriver', () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue({});
  });

  it('writes the key verbatim, encrypted, with the right content type', async () => {
    await driver().upload('cases/abc/PASSPORT/1-uuid.pdf', Buffer.from('%PDF'));

    const [command] = send.mock.calls[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'gksedu-files',
      Key: 'cases/abc/PASSPORT/1-uuid.pdf',
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
    });
    // No ACL: the bucket is private, and an object-level grant would quietly
    // reopen what §9 closes.
    expect(command.input).not.toHaveProperty('ACL');
  });

  it('types a knowledge-base docx, not just case documents', async () => {
    await driver().upload('knowledge/1-uuid.docx', Buffer.from('PK'));

    expect(send.mock.calls[0][0].input.ContentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
  });

  it('reads bytes back through GetObject', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });

    const buffer = await driver().read('cases/abc/PASSPORT/1-uuid.pdf');

    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect([...buffer]).toEqual([1, 2, 3]);
  });

  it('deletes logically — copy under deleted/, then remove the original', async () => {
    await driver().delete('cases/abc/PASSPORT/1-uuid.pdf');

    expect(sentCommands()).toEqual([
      [
        CopyObjectCommand.name,
        expect.objectContaining({
          CopySource: 'gksedu-files/cases%2Fabc%2FPASSPORT%2F1-uuid.pdf',
          Key: 'deleted/cases/abc/PASSPORT/1-uuid.pdf',
        }),
      ],
      [DeleteObjectCommand.name, expect.objectContaining({ Key: 'cases/abc/PASSPORT/1-uuid.pdf' })],
    ]);
  });

  it('treats a missing key as already deleted, and leaves the original alone', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));

    await expect(driver().delete('cases/abc/GONE/1-uuid.pdf')).resolves.toBeUndefined();
    // Crucially: no DeleteObject followed the failed copy.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a real failure on delete', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));

    await expect(driver().delete('cases/abc/PASSPORT/1-uuid.pdf')).rejects.toThrow('denied');
  });
});
