/**
 * Imports the Korean university reference dataset into the `universities` table.
 *
 *   pnpm universities:import              # upsert every record, copy logos to the web app
 *   pnpm universities:import --no-assets  # database only
 *   pnpm universities:import --publish    # also mark imported rows as published
 *
 * The dataset lives outside the repo; point UNIVERSITIES_DATA_DIR at it.
 *
 * Re-running is safe: rows are matched by `slug`, and the staff-maintained
 * columns (acceptsLanguagePrep … internalNote, isPublished) are written only
 * when the row is first created — a re-import never overwrites hand-entered
 * brokerage data (ARCHITECTURE.md §3).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Prisma, PrismaClient, UniversityType } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

const DATA_DIR = process.env.UNIVERSITIES_DATA_DIR ?? resolve(REPO_ROOT, '../korean-universities-data');
/** Logos are public, immutable branding — they ship with the web app, not with private storage. */
const LOGO_TARGET_DIR = join(REPO_ROOT, 'apps/web/public/universities/logos');
const LOGO_PUBLIC_PREFIX = '/universities/logos';

const args = new Set(process.argv.slice(2));
const copyAssets = !args.has('--no-assets');
const publish = args.has('--publish');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** Shape of one `data/<slug>.json` record — only the fields the import reads. */
type SourceRecord = {
  slug: string;
  basic: {
    nameKo?: string | null;
    nameEn?: string | null;
    nameMn?: string | null;
    logoUrl?: string | null;
    coverUrl?: string | null;
    shortIntroMn?: string | null;
    detailedIntroMn?: string | null;
    foundedYear?: number | null;
    type?: string | null;
  };
  location: {
    cityEn?: string | null;
    cityMn?: string | null;
    regionEn?: string | null;
    regionMn?: string | null;
    address?: string | null;
    coordinates?: { lat?: number | null; lon?: number | null } | null;
    googleMapsLink?: string | null;
    distanceFromSeoulKm?: number | null;
    travelTimeFromSeoul?: string | null;
    nearestMetroBus?: string | null;
  };
  metrics: {
    studentsTotal?: { value?: number | null } | null;
    internationalStudents?: { value?: number | null } | number | null;
    mongolianStudents?: { value?: number | null } | number | null;
    numCampuses?: { value?: number | null } | number | null;
    campusInfo?: string | null;
  };
  dormitory?: unknown;
  livingCost?: unknown;
  advantages?: string[] | null;
  links?: Record<string, unknown> | null;
  quality?: Record<string, unknown> | null;
};

const TYPES: Record<string, UniversityType> = {
  national: UniversityType.NATIONAL,
  public: UniversityType.PUBLIC,
  private: UniversityType.PRIVATE,
};

/** `{ value: n }` and a bare number both appear in the dataset. */
function numeric(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (input && typeof input === 'object' && 'value' in input) {
    const value = (input as { value?: unknown }).value;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  return null;
}

function text(input: unknown): string | null {
  return typeof input === 'string' && input.trim() ? input.trim() : null;
}

function json(input: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return input === null || input === undefined ? Prisma.JsonNull : (input as Prisma.InputJsonValue);
}

function copyLogo(record: SourceRecord): string | null {
  const source = text(record.basic.logoUrl);
  if (!source) return null;

  const file = basename(source);
  const publicPath = `${LOGO_PUBLIC_PREFIX}/${file}`;
  if (!copyAssets) return publicPath;

  try {
    copyFileSync(join(DATA_DIR, source.replace(/^\//, '')), join(LOGO_TARGET_DIR, file));
    return publicPath;
  } catch {
    console.warn(`  logo missing for ${record.slug}: ${source}`);
    return null;
  }
}

async function main(): Promise<void> {
  const dataDir = join(DATA_DIR, 'data');
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
  if (!files.length) throw new Error(`No records in ${dataDir}`);

  if (copyAssets) mkdirSync(LOGO_TARGET_DIR, { recursive: true });

  let created = 0;
  let updated = 0;
  const warnings: string[] = [];
  const importedSlugs: string[] = [];

  for (const file of files.sort()) {
    const record = JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as SourceRecord;
    const { basic, location, metrics } = record;

    const nameEn = text(basic.nameEn);
    const type = TYPES[text(basic.type) ?? ''];
    if (!record.slug || !nameEn || !type) {
      warnings.push(`${file}: missing slug/nameEn/type — skipped`);
      continue;
    }

    // A handful of records lack the Mongolian rendering; fall back rather than
    // dropping the school, and flag it so an editor can fill it in.
    const nameMn = text(basic.nameMn) ?? nameEn;
    if (!text(basic.nameMn)) warnings.push(`${record.slug}: nameMn missing, using nameEn`);
    const cityEn = text(location.cityEn) ?? '';
    const cityMn = text(location.cityMn) ?? cityEn;
    const regionEn = text(location.regionEn) ?? '';
    const regionMn = text(location.regionMn) ?? regionEn;

    const links = { ...(record.links ?? {}) } as Record<string, unknown>;
    if (text(basic.coverUrl)) links.coverUrl = text(basic.coverUrl);
    if (text(location.googleMapsLink)) links.googleMaps = text(location.googleMapsLink);

    const fromDataset = {
      nameKo: text(basic.nameKo) ?? nameEn,
      nameEn,
      nameMn,
      type,
      foundedYear: numeric(basic.foundedYear),
      cityEn,
      cityMn,
      regionEn,
      regionMn,
      address: text(location.address),
      lat: numeric(location.coordinates?.lat),
      lon: numeric(location.coordinates?.lon),
      logoPath: copyLogo(record),
      shortIntroMn: text(basic.shortIntroMn),
      detailedIntroMn: text(basic.detailedIntroMn),
      studentsTotal: numeric(metrics.studentsTotal),
      internationalStudents: numeric(metrics.internationalStudents),
      mongolianStudents: numeric(metrics.mongolianStudents),
      numCampuses: numeric(metrics.numCampuses),
      campusInfo: text(metrics.campusInfo),
      distanceFromSeoulKm: numeric(location.distanceFromSeoulKm),
      travelTimeFromSeoul: text(location.travelTimeFromSeoul),
      nearestTransit: text(location.nearestMetroBus),
      advantages: record.advantages ?? [],
      livingCost: json(record.livingCost),
      dormitory: json(record.dormitory),
      links: json(links),
      quality: json(record.quality ?? {}),
    } satisfies Prisma.UniversityUpdateInput;

    const existing = await prisma.university.findUnique({
      where: { slug: record.slug },
      select: { id: true },
    });

    await prisma.university.upsert({
      where: { slug: record.slug },
      // Staff-owned columns are absent here on purpose: a re-import refreshes the
      // dataset fields and leaves brokerage decisions alone.
      update: fromDataset,
      create: { slug: record.slug, ...fromDataset, isPublished: publish },
    });

    importedSlugs.push(record.slug);
    if (existing) updated += 1;
    else created += 1;
  }

  if (publish) {
    // Only rows this run touched — a school staff deliberately unpublished and
    // then removed from the dataset stays unpublished.
    await prisma.university.updateMany({
      where: { slug: { in: importedSlugs } },
      data: { isPublished: true },
    });
  }

  for (const warning of warnings) console.warn(`  ! ${warning}`);
  console.log(
    `Universities imported from ${DATA_DIR}: ${created} created, ${updated} updated` +
      (copyAssets ? `, logos copied to ${LOGO_TARGET_DIR}` : ''),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
