import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StorageDriver } from './storage.types.js';

/**
 * Dev/self-hosted default — writes under `apps/api/<localDir>/`, gitignored.
 *
 * `localDir` is resolved, not joined: production sets it to an absolute
 * `/var/www/gks-edu/storage`, and `join(cwd, '/var/www/...')` quietly produced
 * `<cwd>/var/www/gks-edu/storage` — a second store, nested inside the deployed
 * code, that the declared path never pointed at. Files written before and after
 * that divergence ended up in different directories, and the older ones became
 * unreadable. `resolve` makes an absolute value mean what it says.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(process.cwd(), config.getOrThrow<string>('storage.localDir'));
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
