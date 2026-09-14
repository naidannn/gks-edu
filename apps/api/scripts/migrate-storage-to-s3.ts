/**
 * Copies every file already on disk into the S3 bucket, preserving its key.
 *
 *   pnpm storage:migrate --dry              # list what would be copied, write nothing
 *   pnpm storage:migrate                    # copy STORAGE_LOCAL_DIR
 *   pnpm storage:migrate --from <dir>       # copy some other directory
 *   pnpm storage:migrate --force            # re-upload keys already in S3
 *
 * `--from` exists because production's files are not in one place. An absolute
 * `STORAGE_LOCAL_DIR` used to be joined onto the cwd rather than resolved, so
 * the server holds two trees — the declared `/var/www/gks-edu/storage` and a
 * nested `/var/www/gks-edu/api/var/www/gks-edu/storage`. Both are real client
 * documents and both have to be copied; run this once per directory, into the
 * same bucket. The keys inside them do not collide.
 *
 * Run it BEFORE flipping `STORAGE_DRIVER=s3`, while the app is still serving
 * from disk. The two stores use the same key space — `cases/{caseId}/...`,
 * `knowledge/...` — so nothing in the database has to change: a `DocumentFile`
 * row keeps the same `path` and the new driver finds the same bytes.
 *
 * Idempotent. An object that is already in the bucket with the same size is
 * skipped, so an interrupted run is resumed by running it again. `--force`
 * overrides that when a file is known to have been replaced on disk.
 *
 * Nothing on disk is deleted. The local tree stays as it is — it is the
 * rollback if the bucket has to be abandoned, and deleting it is a separate,
 * deliberate act once downloads have been verified against S3.
 *
 * The `.deleted-<ts>` files `LocalStorageDriver` leaves behind are copied under
 * the `deleted/` prefix instead, which is where the S3 driver's logical delete
 * puts them — the same archive, spelled the way the new store spells it.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadEnv } from 'dotenv';
import { STORED_CONTENT_TYPE_BY_EXTENSION } from '../src/storage/storage.types.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const force = args.includes('--force');

const fromIndex = args.indexOf('--from');
const localDir = (fromIndex === -1 ? undefined : args[fromIndex + 1]) ?? process.env.STORAGE_LOCAL_DIR ?? 'storage';
const bucket = process.env.S3_BUCKET ?? '';
const region = process.env.AWS_REGION ?? 'ap-southeast-1';

/** `.deleted-1788803154929` suffix written by `LocalStorageDriver.delete()`. */
const LOCAL_DELETED_SUFFIX = /\.deleted-\d+$/;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/** Local path → S3 key. Windows separators would otherwise become part of the key. */
function keyFor(root: string, file: string): string {
  const rel = relative(root, file).split(sep).join('/');
  return LOCAL_DELETED_SUFFIX.test(rel) ? `deleted/${rel.replace(LOCAL_DELETED_SUFFIX, '')}` : rel;
}

async function existsWithSize(client: S3Client, key: string, size: number): Promise<boolean> {
  try {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return head.ContentLength === size;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!bucket) {
    throw new Error('S3_BUCKET тохируулаагүй байна — .env-д бөглөнө үү');
  }

  // `resolve`, not `join`: an absolute --from or STORAGE_LOCAL_DIR must mean
  // itself rather than being appended to the cwd.
  const root = resolve(process.cwd(), localDir);
  if (!(await stat(root).catch(() => null))?.isDirectory()) {
    console.log(`${root} байхгүй — хуулах файл алга.`);
    return;
  }

  const client = new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  console.log(`${root}  →  s3://${bucket} (${region})${dryRun ? '  [DRY RUN]' : ''}\n`);

  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;

  for await (const file of walk(root)) {
    const key = keyFor(root, file);
    const body = await readFile(file);

    if (!force && (await existsWithSize(client, key, body.byteLength))) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      console.log(`  + ${key}  (${body.byteLength} B)`);
    } else {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: STORED_CONTENT_TYPE_BY_EXTENSION[key.split('.').pop() ?? ''] ?? 'application/octet-stream',
          ServerSideEncryption: 'AES256',
        }),
      );
      console.log(`  ✓ ${key}`);
    }
    uploaded += 1;
    bytes += body.byteLength;
  }

  const verb = dryRun ? 'хуулагдах' : 'хуулагдсан';
  console.log(
    `\n${uploaded} файл ${verb} (${(bytes / 1024 / 1024).toFixed(2)} MB), ${skipped} аль хэдийн байсан тул алгасав.`,
  );
  if (!dryRun && uploaded > 0) {
    console.log('Дараа нь STORAGE_DRIVER=s3 болгоод deploy хийнэ. Локал файлууд хэвээр үлдэнэ.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
