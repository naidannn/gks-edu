/**
 * Checks that every file path recorded in the database has a matching object in
 * the S3 bucket.
 *
 *   pnpm storage:verify
 *
 * This is the question the migration script cannot answer. It copies whatever
 * is on disk; it has no idea whether the disk held everything the database
 * refers to. A row pointing at a key that is not in the bucket becomes a broken
 * download the moment `STORAGE_DRIVER=s3` takes effect — so run this BEFORE the
 * cutover, while the old store is still serving.
 *
 * Columns are enumerated by hand rather than discovered: a new nullable
 * `somethingPath` added later will not be checked, and silence here would be
 * worse than a compile error. Keep this list next to `StorageService` callers.
 *
 * Against production: override DATABASE_URL with the direct 5432 URL, since the
 * pooler makes the Prisma CLI hang.
 */
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const bucket = process.env.S3_BUCKET ?? '';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const client = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

/**
 * A table the running schema has but the target database does not (P2021).
 * Production trails the feature branch — the knowledge base's tables are not
 * deployed yet — and a missing table means "no paths here", not a failed check.
 * It is reported so a genuinely absent table is never mistaken for an empty one.
 */
const skipped: string[] = [];

async function optional<T>(model: string, query: () => Promise<T[]>): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    if ((error as { code?: string }).code === 'P2021') {
      skipped.push(model);
      return [];
    }
    throw error;
  }
}

/** Every column that holds a `StorageService` key. Logos and cover images are
 *  absent on purpose — those are public static assets served from the web app,
 *  never from the bucket (TASKS.md 1A-03). */
async function collectPaths(): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  const add = (label: string, values: (string | null)[]): void => {
    const paths = values.filter((value): value is string => Boolean(value));
    if (paths.length > 0) found.set(label, paths);
  };

  const [contracts, collaterals, payments, documentFiles, templates, invoices, invitations, knowledge] =
    await Promise.all([
      optional('Contract', () => prisma.contract.findMany({ select: { pdfPath: true, physicalScanPath: true } })),
      optional('CollateralContract', () => prisma.collateralContract.findMany({ select: { filePath: true } })),
      optional('Payment', () => prisma.payment.findMany({ select: { receiptPath: true } })),
      optional('DocumentFile', () => prisma.documentFile.findMany({ select: { path: true } })),
      optional('DocumentTemplate', () => prisma.documentTemplate.findMany({ select: { sampleFilePath: true } })),
      optional('SchoolInvoice', () => prisma.schoolInvoice.findMany({ select: { receiptPath: true } })),
      optional('Invitation', () => prisma.invitation.findMany({ select: { filePath: true } })),
      optional('KnowledgeDocument', () => prisma.knowledgeDocument.findMany({ select: { sourceFile: true } })),
    ]);

  add('Contract.pdfPath', contracts.map((row) => row.pdfPath));
  add('Contract.physicalScanPath', contracts.map((row) => row.physicalScanPath));
  add('CollateralContract.filePath', collaterals.map((row) => row.filePath));
  add('Payment.receiptPath', payments.map((row) => row.receiptPath));
  add('DocumentFile.path', documentFiles.map((row) => row.path));
  add('DocumentTemplate.sampleFilePath', templates.map((row) => row.sampleFilePath));
  add('SchoolInvoice.receiptPath', invoices.map((row) => row.receiptPath));
  add('Invitation.filePath', invitations.map((row) => row.filePath));
  add('KnowledgeDocument.sourceFile', knowledge.map((row) => row.sourceFile));

  return found;
}

async function existsInBucket(key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  if (!bucket) throw new Error('S3_BUCKET тохируулаагүй байна');

  const byColumn = await collectPaths();
  const all = [...new Set([...byColumn.values()].flat())];
  console.log(`Өгөгдлийн санд ${all.length} өөр файлын зам бүртгэлтэй. s3://${bucket} дээр шалгаж байна...\n`);

  const missing: string[] = [];
  for (const key of all) {
    if (!(await existsInBucket(key))) missing.push(key);
  }

  for (const [label, paths] of byColumn) {
    const gone = paths.filter((path) => missing.includes(path)).length;
    const mark = gone === 0 ? 'OK  ' : 'ДУТУУ';
    console.log(`  ${mark}  ${label}: ${paths.length} зам${gone > 0 ? `, ${gone} нь bucket дээр алга` : ''}`);
  }

  if (skipped.length > 0) {
    console.log(`\n  (энэ өгөгдлийн санд байхгүй хүснэгт: ${skipped.join(', ')})`);
  }

  if (missing.length > 0) {
    console.log(`\n${missing.length} файл bucket дээр байхгүй — эдгээр татагдахгүй болно:`);
    for (const key of missing) console.log(`  - ${key}`);
    process.exitCode = 1;
  } else {
    console.log('\nБүгд байна. STORAGE_DRIVER=s3 болгоход татагдахгүй файл гарахгүй.');
  }

  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
