import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageDriver } from './storage.types.js';

/** Dev/self-hosted default — writes under `apps/api/<localDir>/`, gitignored. */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = join(process.cwd(), config.getOrThrow<string>('storage.localDir'));
  }

  async upload(path: string, buffer: Buffer): Promise<void> {
    const fullPath = this.resolve(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, buffer);
  }

  async read(path: string): Promise<Buffer> {
    return readFile(this.resolve(path));
  }

  async delete(path: string): Promise<void> {
    const fullPath = this.resolve(path);
    const deletedPath = `${fullPath}.deleted-${Date.now()}`;
    await rename(fullPath, deletedPath).catch(() => rm(fullPath, { force: true }));
  }

  private resolve(path: string): string {
    return join(this.root, path);
  }
}
