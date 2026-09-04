import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fileTypeFromBuffer } from 'file-type';
import { ALLOWED_MIME_TYPES, CONTENT_TYPE_BY_EXTENSION, type StorageDriver } from './storage.types.js';

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 0-09 — 20MB cap
const SIGNED_URL_TTL_MS = 5 * 60 * 1000; // ARCHITECTURE.md §9 — 5 min

export interface SignedFileUrl {
  token: string;
  expiresAt: Date;
}

/**
 * Content-agnostic file store (ARCHITECTURE.md §9): `cases/{caseId}/{docCode}/{version}-{uuid}.{ext}`
 * paths, MIME-sniffed uploads with a size cap (0-09), and short-lived HMAC-signed
 * download tokens instead of ever exposing a bucket path directly.
 */
@Injectable()
export class StorageService {
  private readonly signingSecret: string;

  constructor(
    @Inject(STORAGE_DRIVER) private readonly driver: StorageDriver,
    config: ConfigService,
  ) {
    this.signingSecret = config.getOrThrow<string>('storage.signingSecret');
  }

  /** Validates the real file bytes (not the client-supplied header) before writing. */
  async upload(params: { caseId: string; docCode: string; buffer: Buffer }): Promise<{ path: string }> {
    const { caseId, docCode, buffer } = params;

    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException('Файлын хэмжээ 20MB-с ихгүй байх ёстой');
    }

    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !ALLOWED_MIME_TYPES.has(sniffed.mime)) {
      throw new BadRequestException('Зөвшөөрөгдөөгүй файлын төрөл — зөвхөн PDF, JPG, PNG хүлээн авна');
    }

    const version = Date.now();
    const path = `cases/${caseId}/${docCode}/${version}-${randomUUID()}.${sniffed.ext}`;
    await this.driver.upload(path, buffer);
    return { path };
  }

  async read(path: string): Promise<Buffer> {
    return this.driver.read(path);
  }

  async delete(path: string): Promise<void> {
    await this.driver.delete(path);
  }

  /** Short-lived (5 min) signed download token — the only way a client ever reaches a file. */
  sign(path: string): SignedFileUrl {
    const expiresAt = Date.now() + SIGNED_URL_TTL_MS;
    const token = this.encode(path, expiresAt);
    return { token, expiresAt: new Date(expiresAt) };
  }

  /** Verifies signature + expiry, returning the path to read or throwing. */
  verify(token: string): string {
    const [pathB64, expiresAtRaw, signature] = token.split('.');
    if (!pathB64 || !expiresAtRaw || !signature) {
      throw new BadRequestException('Файлын холбоос буруу байна');
    }

    const expiresAt = Number.parseInt(expiresAtRaw, 10);
    const expected = this.hmac(`${pathB64}.${expiresAtRaw}`);
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);

    if (signatureBuf.length !== expectedBuf.length || !timingSafeEqual(signatureBuf, expectedBuf)) {
      throw new BadRequestException('Файлын холбоосын гарын үсэг таарахгүй байна');
    }
    if (Date.now() > expiresAt) {
      throw new BadRequestException('Файлын холбоосын хугацаа дууссан байна');
    }

    return Buffer.from(pathB64, 'base64url').toString('utf8');
  }

  contentTypeFor(path: string): string {
    const ext = path.split('.').pop() ?? '';
    return CONTENT_TYPE_BY_EXTENSION[ext] ?? 'application/octet-stream';
  }

  private encode(path: string, expiresAt: number): string {
    const pathB64 = Buffer.from(path, 'utf8').toString('base64url');
    const signature = this.hmac(`${pathB64}.${expiresAt}`);
    return `${pathB64}.${expiresAt}.${signature}`;
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.signingSecret).update(data).digest('base64url');
  }
}
