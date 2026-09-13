import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { STORED_CONTENT_TYPE_BY_EXTENSION, type StorageDriver } from './storage.types.js';

/**
 * AWS S3 — the production file store (0-08 revisited). Selected with
 * `STORAGE_DRIVER=s3`; `LocalStorageDriver` stays the dev default so nobody
 * needs an AWS account to run the app.
 *
 * The bucket is private and stays private: nothing here ever writes an ACL or
 * mints a presigned S3 URL. A client reaches a file exactly one way — the
 * HMAC-signed token `StorageService.sign()` issues after the caller's role and
 * ownership were checked, redeemed at `GET /files/:token` (ARCHITECTURE.md §9).
 * Keeping the bucket unreachable from the internet is what makes that the only
 * door.
 *
 * Credentials are resolved by the SDK's default chain when
 * `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are absent, so an EC2 instance
 * role works without config. On the shared box we host on, an instance role
 * would hand S3 to the ten other apps living there too — hence a dedicated IAM
 * user's key in `.env` instead.
 *
 * Like the Supabase driver, the client is built lazily: Nest instantiates every
 * provider in the module, and this one must not demand a bucket name while
 * `STORAGE_DRIVER` is something else.
 */
@Injectable()
export class S3StorageDriver implements StorageDriver {
  private readonly logger = new Logger(S3StorageDriver.name);
  private clientInstance?: S3Client;

  constructor(private readonly config: ConfigService) {}

  async upload(path: string, buffer: Buffer): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: path,
          Body: buffer,
          ContentType: STORED_CONTENT_TYPE_BY_EXTENSION[path.split('.').pop() ?? ''] ?? 'application/octet-stream',
          // Belt and braces: the bucket is encrypted by default, but a bucket
          // recreated without that setting would silently store plaintext.
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (error) {
      this.logger.error(`${path} байршуулж чадсангүй: ${describe(error)}`);
      throw error;
    }
  }

  async read(path: string): Promise<Buffer> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: path }));
      if (!result.Body) throw new Error(`Empty body for ${path}`);
      return Buffer.from(await result.Body.transformToByteArray());
    } catch (error) {
      this.logger.error(`${path} татаж чадсангүй: ${describe(error)}`);
      throw error;
    }
  }

  /**
   * Logical delete (ARCHITECTURE.md §9): the object moves under a `deleted/`
   * prefix instead of leaving the bucket. `CopyObject` does it server-side, so
   * unlike the Supabase driver the bytes never travel through the API.
   *
   * A key that is already gone is not an error — re-deleting a document must
   * not fail the request that asked for it.
   */
  async delete(path: string): Promise<void> {
    const bucket = this.bucket;
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          CopySource: `${bucket}/${encodeURIComponent(path)}`,
          Key: `deleted/${path}`,
          ServerSideEncryption: 'AES256',
        }),
      );
    } catch (error) {
      if (isNotFound(error)) return;
      this.logger.error(`${path} архивлаж чадсангүй: ${describe(error)}`);
      throw error;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: path }));
  }

  private get bucket(): string {
    return this.config.getOrThrow<string>('storage.s3Bucket');
  }

  private get client(): S3Client {
    if (!this.clientInstance) {
      const accessKeyId = this.config.get<string>('storage.s3AccessKeyId');
      const secretAccessKey = this.config.get<string>('storage.s3SecretAccessKey');
      this.clientInstance = new S3Client({
        region: this.config.getOrThrow<string>('storage.s3Region'),
        // Set only for S3-compatible stores (MinIO, R2); undefined means real AWS.
        endpoint: this.config.get<string>('storage.s3Endpoint') || undefined,
        forcePathStyle: Boolean(this.config.get<string>('storage.s3Endpoint')),
        // Omitting `credentials` entirely is what lets the default chain (env
        // vars, shared config, EC2 instance role) take over.
        ...(accessKeyId && secretAccessKey ? { credentials: { accessKeyId, secretAccessKey } } : {}),
      });
    }
    return this.clientInstance;
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
