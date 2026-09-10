/**
 * The nine schools GKS actually brokers language prep for, and their 2026
 * December round — the office's own "сургууль хугацаа" sheet.
 *
 *   pnpm language-prep:import          # apply
 *   pnpm language-prep:import --dry    # report what would change, write nothing
 *
 * Three things happen here, in this order:
 *
 *  1. The seeded placeholders go. A fresh database used to get four rounds a
 *     year on six arbitrary schools, every one of them ending on the last day
 *     of the month and charging ₩1,700,000, so that the module had something to
 *     render. Next to real dates that is worse than an empty table, so any
 *     unreferenced language-prep round still carrying the seed note — and any
 *     unverified, machine-suggested language programme — is deleted. A row a
 *     case or an application points at is never touched; it is reported instead.
 *  2. The nine schools are marked `acceptsLanguagePrep`.
 *  3. Each gets its 한국어교육원 정규과정 with the real per-term tuition, and one
 *     `IntakeTerm` for 2026/12 carrying the school's own deadline.
 *
 * `internalDeadline` is left to `resolveInternalDeadline` — deadline minus
 * `AdmissionConfig.internalLeadDays` — and a date a human has already typed
 * (`internalDeadlineIsManual`) is never overwritten. Three of the nine schools
 * close on 2026-09-15, which puts our internal date in the past: those rounds
 * read as closed, which is the honest answer, and staff can override the
 * internal date per row in `/admin/admissions`.
 *
 * Re-running is safe: the deletes match only placeholder rows, and the writes
 * are upserts keyed on (university, level, year, month) and (university, level,
 * name).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import {
  IntakeSource,
  IntakeStatus,
  ProgramLevel,
  ProgramSource,
  PrismaClient,
} from '../src/generated/prisma/client.js';
import {
  DEFAULT_INTERNAL_LEAD_DAYS,
  resolveInternalDeadline,
} from '../src/modules/admissions/intake-deadline.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** The note `prisma/seed.ts` stamps on every intake round it invents. */
const SEED_INTAKE_NOTE = 'Ерөнхий хуанлиар үүсгэсэн жишээ огноо — сургуулиас баталгаажуулаагүй.';
/** The prefix `prisma/seed.ts` stamps on every programme it invents. */
const SEED_PROGRAM_NOTE = 'Seed өгөгдөл';

/** The language institute's regular course. One per school, named in Mongolian. */
const PROGRAM_NAME_MN = 'Солонгос хэлний бэлтгэл';
const PROGRAM_NAME_EN = 'Korean Language Program';
const PROGRAM_NAME_KO = '한국어교육원 정규과정';

const SOURCE_NOTE = 'GKS EDU-ийн "сургууль хугацаа" хүснэгт (2026 оны 12 сарын элсэлт).';

/** The intake this sheet describes: classes start in December 2026. */
const INTAKE_YEAR = 2026;
const INTAKE_MONTH = 12;
/** Korean language institutes publish tuition per 10-week term; this is that year's table. */
const TUITION_YEAR = 2026;

interface LanguagePrepRow {
  slug: string;
  /** As the office wrote it, so an unmatched row is recognisable. */
  nameEn: string;
  /** ₩ per 10-week term. Never the annual figure — the schools do not publish one. */
  tuitionPerTermKrw: number;
  /** The school's own last day, `YYYY-MM-DD`. Ours is derived from it, never typed here. */
  applicationDeadline: string;
  /** First day of classes, `YYYY-MM-DD`. Null where the sheet gives only the month. */
  classStartDate: string | null;
}

const ROWS: LanguagePrepRow[] = [
  { slug: 'korea-university', nameEn: 'Korea University', tuitionPerTermKrw: 1_800_000, applicationDeadline: '2026-10-28', classStartDate: '2026-12-10' },
  { slug: 'sungkyunkwan-university', nameEn: 'Sungkyunkwan University', tuitionPerTermKrw: 1_780_000, applicationDeadline: '2026-10-01', classStartDate: '2026-12-02' },
  { slug: 'sookmyung-womens-university', nameEn: "Sookmyung Women's University", tuitionPerTermKrw: 1_660_000, applicationDeadline: '2026-09-15', classStartDate: null },
  { slug: 'ajou-university', nameEn: 'Ajou University', tuitionPerTermKrw: 1_500_000, applicationDeadline: '2026-09-23', classStartDate: null },
  { slug: 'hanyang-university', nameEn: 'Hanyang University', tuitionPerTermKrw: 1_850_000, applicationDeadline: '2026-09-15', classStartDate: null },
  { slug: 'hanyang-university-erica', nameEn: 'Hanyang University ERICA', tuitionPerTermKrw: 1_500_000, applicationDeadline: '2026-09-15', classStartDate: null },
  { slug: 'seoul-national-university', nameEn: 'Seoul National University', tuitionPerTermKrw: 1_800_000, applicationDeadline: '2026-09-22', classStartDate: '2026-12-07' },
  { slug: 'yonsei-university', nameEn: 'Yonsei University', tuitionPerTermKrw: 1_800_000, applicationDeadline: '2026-10-16', classStartDate: '2026-12-01' },
  { slug: 'cheongju-university', nameEn: 'Cheongju University', tuitionPerTermKrw: 1_860_000, applicationDeadline: '2026-10-01', classStartDate: null },
];

/** A deadline is the whole of its last day, in UTC — the convention the module already uses. */
function endOfDayUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59));
}

function dateUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

/**
 * Remove the seeded language-prep placeholders, leaving anything a case, a
 * client or an application depends on exactly where it is.
 */
async function purgePlaceholders(): Promise<void> {
  const intakes = await prisma.intakeTerm.findMany({
    where: { level: ProgramLevel.LANGUAGE_PREP, note: SEED_INTAKE_NOTE },
    select: {
      id: true,
      year: true,
      month: true,
      university: { select: { nameEn: true } },
      _count: { select: { cases: true, clients: true, applications: true } },
    },
  });
  const removableIntakes = intakes.filter(
    (intake) => intake._count.cases + intake._count.clients + intake._count.applications === 0,
  );
  for (const intake of intakes) {
    if (!removableIntakes.includes(intake)) {
      console.warn(`  kept (in use): ${intake.university.nameEn} ${intake.year}/${intake.month}`);
    }
  }

  const programs = await prisma.universityProgram.findMany({
    where: {
      level: ProgramLevel.LANGUAGE_PREP,
      OR: [
        { internalNote: { startsWith: SEED_PROGRAM_NOTE } },
        { sourceType: ProgramSource.AI_ASSISTED, verifiedAt: null },
      ],
    },
    select: {
      id: true,
      nameMn: true,
      university: { select: { nameEn: true } },
      _count: { select: { cases: true, applications: true, caseChoices: true, intakeOverrides: true } },
    },
  });
  const removablePrograms = programs.filter(
    (program) =>
      program._count.cases +
        program._count.applications +
        program._count.caseChoices +
        program._count.intakeOverrides ===
      0,
  );
  for (const program of programs) {
    if (!removablePrograms.includes(program)) {
      console.warn(`  kept (in use): ${program.university.nameEn} — ${program.nameMn}`);
    }
  }

  console.log(
    `${dryRun ? '[dry] would delete' : 'Deleting'} ${removableIntakes.length} placeholder intake round(s) and ${removablePrograms.length} placeholder programme(s)`,
  );
  if (dryRun) return;

  await prisma.$transaction([
    prisma.intakeTerm.deleteMany({ where: { id: { in: removableIntakes.map((intake) => intake.id) } } }),
    prisma.universityProgram.deleteMany({
      where: { id: { in: removablePrograms.map((program) => program.id) } },
    }),
  ]);
}

async function main(): Promise<void> {
  const universities = await prisma.university.findMany({
    where: { slug: { in: ROWS.map((row) => row.slug) } },
    select: { id: true, slug: true, nameEn: true, acceptsLanguagePrep: true },
  });
  const bySlug = new Map(universities.map((university) => [university.slug, university]));

  const missing = ROWS.filter((row) => !bySlug.has(row.slug));
  if (missing.length) {
    throw new Error(
      `Not in the catalogue: ${missing.map((row) => `${row.slug} (${row.nameEn})`).join(', ')}`,
    );
  }

  await purgePlaceholders();

  const config = await prisma.admissionConfig.findUnique({ where: { id: 'default' } });
  const leadDays = config?.internalLeadDays ?? DEFAULT_INTERNAL_LEAD_DAYS;
  const now = new Date();

  console.log(`\nInternal deadlines run ${leadDays} day(s) ahead of the school's:`);

  for (const row of ROWS) {
    const university = bySlug.get(row.slug)!;
    const applicationDeadline = endOfDayUtc(row.applicationDeadline);
    const classStartDate = row.classStartDate ? dateUtc(row.classStartDate) : null;

    const existing = await prisma.intakeTerm.findUnique({
      where: {
        universityId_level_year_month: {
          universityId: university.id,
          level: ProgramLevel.LANGUAGE_PREP,
          year: INTAKE_YEAR,
          month: INTAKE_MONTH,
        },
      },
      select: { internalDeadline: true, internalDeadlineIsManual: true },
    });

    const internalDeadline = resolveInternalDeadline({
      applicationDeadline,
      internalDeadline: existing?.internalDeadline ?? null,
      internalDeadlineIsManual: existing?.internalDeadlineIsManual ?? false,
      leadDays,
    });

    const flag = internalDeadline && internalDeadline < now ? '  ← already past' : '';
    console.log(
      `  ${university.nameEn.padEnd(34)} school ${row.applicationDeadline}  ours ${internalDeadline?.toISOString().slice(0, 10) ?? '—'}  ₩${row.tuitionPerTermKrw.toLocaleString('en-US')}/улирал${flag}`,
    );

    if (dryRun) continue;

    await prisma.university.update({
      where: { id: university.id },
      data: { acceptsLanguagePrep: true },
    });

    await prisma.universityProgram.upsert({
      where: {
        universityId_level_nameMn: {
          universityId: university.id,
          level: ProgramLevel.LANGUAGE_PREP,
          nameMn: PROGRAM_NAME_MN,
        },
      },
      // Only what the sheet actually carries. Anything a colleague filled in
      // since — 입학금, the scholarship note, the faculty — is left alone.
      update: {
        nameEn: PROGRAM_NAME_EN,
        nameKo: PROGRAM_NAME_KO,
        tuitionPerTermKrw: row.tuitionPerTermKrw,
        tuitionYear: TUITION_YEAR,
        sourceType: ProgramSource.IMPORTED,
        verifiedAt: now,
        internalNote: SOURCE_NOTE,
        isPublished: true,
      },
      create: {
        universityId: university.id,
        level: ProgramLevel.LANGUAGE_PREP,
        nameMn: PROGRAM_NAME_MN,
        nameEn: PROGRAM_NAME_EN,
        nameKo: PROGRAM_NAME_KO,
        tuitionPerTermKrw: row.tuitionPerTermKrw,
        // A language institute runs four 10-week terms, not two semesters, so
        // the ×2 annual figure would be wrong. The sheet gives no annual price.
        tuitionPerYearKrw: null,
        admissionFeeKrw: null,
        tuitionYear: TUITION_YEAR,
        sourceType: ProgramSource.IMPORTED,
        verifiedAt: now,
        internalNote: SOURCE_NOTE,
      },
    });

    await prisma.intakeTerm.upsert({
      where: {
        universityId_level_year_month: {
          universityId: university.id,
          level: ProgramLevel.LANGUAGE_PREP,
          year: INTAKE_YEAR,
          month: INTAKE_MONTH,
        },
      },
      update: {
        applicationDeadline,
        internalDeadline,
        classStartDate,
        status: IntakeStatus.OPEN,
        sourceType: IntakeSource.IMPORTED,
        note: SOURCE_NOTE,
        verifiedAt: now,
      },
      create: {
        universityId: university.id,
        level: ProgramLevel.LANGUAGE_PREP,
        year: INTAKE_YEAR,
        month: INTAKE_MONTH,
        applicationDeadline,
        internalDeadline,
        classStartDate,
        status: IntakeStatus.OPEN,
        sourceType: IntakeSource.IMPORTED,
        note: SOURCE_NOTE,
        verifiedAt: now,
      },
    });
  }

  if (dryRun) {
    console.log('\n[dry] nothing written');
    return;
  }
  console.log(`\nApplied ${ROWS.length} school(s) for ${INTAKE_YEAR}/${INTAKE_MONTH}.`);
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
