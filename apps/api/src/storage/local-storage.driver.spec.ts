import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageDriver } from './local-storage.driver.js';

function driverRootedAt(localDir: string): LocalStorageDriver {
  return new LocalStorageDriver({ getOrThrow: () => localDir } as unknown as ConfigService);
}

describe('LocalStorageDriver', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'gks-storage-'));
  });

  it('treats an absolute STORAGE_LOCAL_DIR as the root, not as a suffix', async () => {
    // Production sets `/var/www/gks-edu/storage`. Joining that onto the cwd
    // produced `<cwd>/var/www/gks-edu/storage` — a second, hidden store.
    await driverRootedAt(root).upload('cases/abc/PASSPORT/1-uuid.pdf', Buffer.from('%PDF'));

    expect(await readFile(join(root, 'cases/abc/PASSPORT/1-uuid.pdf'), 'utf8')).toBe('%PDF');
  });

  it('round-trips a file', async () => {
    const driver = driverRootedAt(root);
    await driver.upload('knowledge/1-uuid.docx', Buffer.from('PK'));

    expect(await driver.read('knowledge/1-uuid.docx')).toEqual(Buffer.from('PK'));
  });

  it('deletes logically — the bytes stay behind under a .deleted- name', async () => {
    const driver = driverRootedAt(root);
    await driver.upload('cases/abc/PASSPORT/1-uuid.pdf', Buffer.from('%PDF'));

    await driver.delete('cases/abc/PASSPORT/1-uuid.pdf');

    const left = await readdir(join(root, 'cases/abc/PASSPORT'));
    expect(left).toHaveLength(1);
    expect(left[0]).toMatch(/^1-uuid\.pdf\.deleted-\d+$/);
  });
});
