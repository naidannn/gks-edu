/**
 * The language-prep schools GKS brokers, priced and dated from the office's own
 * research — "Сургуулиудын мэдээллийн судалгаа.xlsx", sheet "хэлний бэлтгэл"
 * (2026-11). The office called it the latest word: where it disagrees with
 * the database, the sheet wins.
 *
 *   pnpm language-prep:import          # apply
 *   pnpm language-prep:import --dry    # report what would change, write nothing
 *
 * Per school:
 *
 *  1. The school exists. Four of the thirteen were not in the 135-school
 *     catalogue (Seojeong, Hosan, Korea University of Media Arts, Catholic
 *     Kwandong); they are created with what the sheet and the school's own
 *     site give, published, and left for staff to fill in. An existing school
 *     is never rewritten here beyond `acceptsLanguagePrep`.
 *  2. Its 한국어교육원 programme carries the sheet's per-term tuition, its
 *     minimum enrolment (`minEnrollmentTerms` — six months or a year, the
 *     sheet's "төлбөрийн шалгуур") and its registration fee.
 *  3. Each published 2027 round is upserted on (school, level, year, month):
 *     opening day, the school's deadline, first day of classes, fee.
 *
 * `internalDeadline` is derived by `resolveInternalDeadline`. A date staff
 * typed by hand (`internalDeadlineIsManual`) survives — unless the sheet moves
 * the school's own deadline under it, in which case a frozen internal date
 * belongs to a deadline that no longer exists: it is recomputed and reported.
 *
 * A round with no application dates (Hosan) is written as `PLANNED`, which no
 * visitor sees, so staff can add the deadline before it goes public.
 *
 * This replaces the 2026-09 importer of the "сургууль хугацаа" sheet. That one
 * also deleted unverified AI-researched language programmes as "placeholders"
 * — by now about a hundred published rows — so that step is gone on purpose.
 *
 * Re-running is safe: every write is an upsert.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import {
  IntakeSource,
  IntakeStatus,
  ProgramLevel,
  ProgramSource,
  PrismaClient,
  UniversityType,
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

/** The language institute's regular course. One per school, named in Mongolian. */
const PROGRAM_NAME_MN = 'Солонгос хэлний бэлтгэл';
const PROGRAM_NAME_EN = 'Korean Language Program';
const PROGRAM_NAME_KO = '한국어교육원 정규과정';

/**
 * Staff-only provenance — the programme's `internalNote`, never
 * `IntakeTerm.note`, which the public payload renders verbatim.
 */
const SOURCE_NOTE = 'GKS EDU-ийн "Сургуулиудын мэдээллийн судалгаа" (2026-11), хэлний бэлтгэл хуудас.';

/** The sheet prices the 2027 rounds. */
const TUITION_YEAR = 2027;

interface Round {
  /** 3, 6, 9 or 12 — spring, summer, autumn, winter. */
  month: number;
  year: number;
  /** `YYYY-MM-DD`. The school's window; null where the sheet gives none. */
  openAt: string | null;
  deadline: string | null;
  /** First day of classes. Null keeps whatever the row already has. */
  classStart: string | null;
  /** Where the sheet was read rather than copied — printed on every run. */
  fix?: string;
}

interface Row {
  slug: string;
  nameKo: string;
  /** ₩ per 10-week term. */
  perTermKrw: number;
  /** 2 = six months, 4 = a year — what a new student pays for in one go. */
  minEnrollmentTerms: number;
  /** "Бүртгэлийн хураамж" — the one-off registration fee, ₩. */
  feeKrw: number;
  rounds: Round[];
}

const ROWS: Row[] = [
  {
    slug: 'seojeong-university',
    nameKo: '서정대학교',
    perTermKrw: 1_100_000,
    minEnrollmentTerms: 4,
    feeKrw: 50_000,
    rounds: [],
  },
  {
    slug: 'busan-university-of-foreign-studies',
    nameKo: '부산외국어대학교',
    perTermKrw: 1_400_000,
    minEnrollmentTerms: 2,
    feeKrw: 50_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-01', deadline: '2027-01-11', classStart: '2027-03-02' },
      { month: 6, year: 2027, openAt: '2027-03-08', deadline: '2027-04-10', classStart: '2027-05-20' },
      { month: 9, year: 2027, openAt: '2027-06-01', deadline: '2027-07-10', classStart: '2027-09-01' },
      { month: 12, year: 2027, openAt: '2027-08-31', deadline: '2027-09-30', classStart: '2027-11-19' },
    ],
  },
  {
    slug: 'hanyang-university',
    nameKo: '한양대학교',
    perTermKrw: 1_850_000,
    minEnrollmentTerms: 4,
    feeKrw: 150_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-09', deadline: '2027-01-07', classStart: '2027-03-03' },
      { month: 6, year: 2027, openAt: '2027-03-10', deadline: '2027-04-08', classStart: '2027-06-02' },
      { month: 9, year: 2027, openAt: '2027-06-09', deadline: '2027-07-08', classStart: '2027-09-01' },
      { month: 12, year: 2027, openAt: '2027-09-08', deadline: '2027-10-07', classStart: '2027-12-03' },
    ],
  },
  {
    slug: 'hanyang-university-erica',
    nameKo: '한양대학교 ERICA',
    perTermKrw: 1_500_000,
    minEnrollmentTerms: 2,
    feeKrw: 100_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-07', deadline: '2027-01-08', classStart: '2027-03-02' },
      { month: 6, year: 2027, openAt: '2027-03-08', deadline: '2027-04-02', classStart: '2027-06-02' },
      { month: 9, year: 2027, openAt: '2027-05-31', deadline: '2027-07-09', classStart: '2027-09-01' },
      { month: 12, year: 2027, openAt: '2027-09-06', deadline: '2027-10-08', classStart: '2027-12-01' },
    ],
  },
  {
    slug: 'sookmyung-womens-university',
    nameKo: '숙명여자대학교',
    perTermKrw: 1_660_000,
    minEnrollmentTerms: 2,
    feeKrw: 60_000,
    rounds: [],
  },
  {
    slug: 'sungkyunkwan-university',
    nameKo: '성균관대학교',
    perTermKrw: 1_780_000,
    minEnrollmentTerms: 4,
    feeKrw: 80_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-07', deadline: '2027-01-22', classStart: '2027-03-08' },
      { month: 6, year: 2027, openAt: '2027-03-15', deadline: '2027-04-30', classStart: '2027-06-07' },
      { month: 9, year: 2027, openAt: '2027-06-14', deadline: '2027-07-30', classStart: '2027-09-06' },
      { month: 12, year: 2027, openAt: '2027-09-08', deadline: '2027-10-29', classStart: '2027-12-06' },
    ],
  },
  {
    slug: 'seoul-national-university',
    nameKo: '서울대학교',
    perTermKrw: 1_800_000,
    minEnrollmentTerms: 2,
    feeKrw: 100_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-11-02', deadline: '2026-12-24', classStart: '2027-03-08', fix: 'sheet says 2027.12.24; the window opens 2026.11.02 and classes start 2027.03.08' },
      { month: 6, year: 2027, openAt: '2027-02-01', deadline: '2027-03-29', classStart: '2027-06-07' },
      { month: 9, year: 2027, openAt: '2027-05-03', deadline: '2027-06-28', classStart: '2027-09-06' },
      { month: 12, year: 2027, openAt: '2027-08-02', deadline: '2027-08-24', classStart: '2027-12-06' },
    ],
  },
  {
    slug: 'korea-university',
    nameKo: '고려대학교',
    perTermKrw: 1_960_000,
    minEnrollmentTerms: 4,
    feeKrw: 130_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-07', deadline: '2027-01-22', classStart: '2027-03-18' },
      { month: 6, year: 2027, openAt: '2027-03-08', deadline: '2027-04-23', classStart: '2027-06-16' },
      { month: 9, year: 2027, openAt: '2027-06-07', deadline: '2027-07-23', classStart: '2027-09-10' },
      { month: 12, year: 2027, openAt: '2027-09-06', deadline: '2027-10-22', classStart: '2027-12-14' },
    ],
  },
  {
    slug: 'yonsei-university',
    nameKo: '연세대학교',
    perTermKrw: 1_960_000,
    minEnrollmentTerms: 4,
    feeKrw: 130_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-07', deadline: '2027-01-15', classStart: '2027-03-05' },
      { month: 6, year: 2027, openAt: '2027-03-08', deadline: '2027-04-16', classStart: '2027-06-03' },
      { month: 9, year: 2027, openAt: '2027-06-07', deadline: '2027-07-16', classStart: '2027-09-01' },
      { month: 12, year: 2027, openAt: '2027-09-06', deadline: '2027-10-15', classStart: '2027-12-01' },
    ],
  },
  {
    slug: 'hosan-university',
    nameKo: '호산대학교',
    perTermKrw: 1_100_000,
    minEnrollmentTerms: 4,
    feeKrw: 100_000,
    rounds: [
      { month: 3, year: 2027, openAt: null, deadline: null, classStart: '2027-03-16' },
      { month: 6, year: 2027, openAt: null, deadline: null, classStart: '2027-06-15' },
    ],
  },
  {
    slug: 'silla-university',
    nameKo: '신라대학교',
    perTermKrw: 1_300_000,
    minEnrollmentTerms: 2,
    feeKrw: 50_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-11-01', deadline: '2026-11-30', classStart: null },
      { month: 9, year: 2027, openAt: '2027-05-01', deadline: '2027-05-30', classStart: null },
    ],
  },
  {
    slug: 'korea-university-of-media-arts',
    nameKo: '한국영상대학교',
    perTermKrw: 1_150_000,
    minEnrollmentTerms: 2,
    feeKrw: 50_000,
    rounds: [],
  },
  {
    slug: 'catholic-kwandong-university',
    nameKo: '가톨릭관동대학교',
    perTermKrw: 1_200_000,
    minEnrollmentTerms: 2,
    feeKrw: 70_000,
    rounds: [
      { month: 3, year: 2027, openAt: '2026-12-15', deadline: '2027-01-23', classStart: '2027-03-03' },
      { month: 6, year: 2027, openAt: '2027-03-16', deadline: '2027-04-24', classStart: '2027-06-01' },
      { month: 9, year: 2027, openAt: '2027-06-22', deadline: '2027-07-24', classStart: '2027-09-01' },
      { month: 12, year: 2027, openAt: '2027-09-21', deadline: '2027-10-23', classStart: '2027-12-01' },
    ],
  },
];

/** Not in the 135-school catalogue until this sheet. Created only if absent. */
const NEW_SCHOOLS = [
  {
    slug: 'seojeong-university',
    nameKo: '서정대학교',
    nameEn: 'Seojeong University',
    nameMn: 'Сөжон их сургууль',
    cityEn: 'Yangju',
    cityMn: 'Янжу',
    regionEn: 'Gyeonggi',
    regionMn: 'Кёнги',
    website: 'https://www.seojeong.ac.kr',
  },
  {
    // Gyeongsan, on Daegu's edge — filed under Daegu, as Daegu University is.
    slug: 'hosan-university',
    nameKo: '호산대학교',
    nameEn: 'Hosan University',
    nameMn: 'Хосан их сургууль',
    cityEn: 'Gyeongsan',
    cityMn: 'Кёнсан',
    regionEn: 'Daegu',
    regionMn: 'Тэгү',
    website: 'https://www.hosan.ac.kr',
  },
  {
    slug: 'korea-university-of-media-arts',
    nameKo: '한국영상대학교',
    nameEn: 'Korea University of Media Arts',
    nameMn: 'Солонгосын Медиа урлагийн их сургууль',
    cityEn: 'Sejong',
    cityMn: 'Сэжон',
    regionEn: 'Sejong',
    regionMn: 'Сэжон',
    website: 'https://www.pro.ac.kr',
  },
  {
    slug: 'catholic-kwandong-university',
    nameKo: '가톨릭관동대학교',
    nameEn: 'Catholic Kwandong University',
    nameMn: 'Католик Кваньдун их сургууль',
    cityEn: 'Gangneung',
    cityMn: 'Каннын',
    regionEn: 'Gangwon',
    regionMn: 'Канвон',
    website: 'https://www.cku.ac.kr',
  },
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

const day = (value: Date | null | undefined) => value?.toISOString().slice(0, 10) ?? '—';
const krw = (value: number | null | undefined) => (value == null ? '—' : `₩${value.toLocaleString('en-US')}`);

async function ensureNewSchools(): Promise<Set<string>> {
  const existing = new Set(
    (await prisma.university.findMany({ where: { slug: { in: NEW_SCHOOLS.map((s) => s.slug) } }, select: { slug: true } })).map(
      (row) => row.slug,
    ),
  );
  const pending = new Set<string>();
  for (const school of NEW_SCHOOLS) {
    if (existing.has(school.slug)) continue;
    console.log(`${dryRun ? '[dry] would create' : 'Creating'} school ${school.nameEn} (${school.nameKo}), ${school.cityEn}`);
    if (dryRun) {
      pending.add(school.slug);
      continue;
    }
    const { website, ...fields } = school;
    await prisma.university.create({
      data: {
        ...fields,
        type: UniversityType.PRIVATE,
        links: { officialWebsite: website },
        acceptsLanguagePrep: true,
        isPublished: true,
        internalNote: `Хэлний бэлтгэлийн судалгааны хүснэгтээс нэмсэн (2026-11). Лого, танилцуулга, дотуур байрны мэдээллийг бөглөх.`,
      },
    });
  }
  return pending;
}

async function main(): Promise<void> {
  const pendingSchools = await ensureNewSchools();

  const universities = await prisma.university.findMany({
    where: { slug: { in: ROWS.map((row) => row.slug) } },
    select: { id: true, slug: true, nameEn: true },
  });
  const bySlug = new Map(universities.map((university) => [university.slug, university]));
  const missing = ROWS.filter((row) => !bySlug.has(row.slug) && !pendingSchools.has(row.slug));
  if (missing.length) throw new Error(`Not in the catalogue: ${missing.map((row) => row.slug).join(', ')}`);

  const config = await prisma.admissionConfig.findUnique({ where: { id: 'default' } });
  const leadDays = config?.internalLeadDays ?? DEFAULT_INTERNAL_LEAD_DAYS;
  const now = new Date();
  let written = 0;

  console.log(`\nInternal deadlines run ${leadDays} day(s) ahead of the school's.\n`);

  for (const row of ROWS) {
    const university = bySlug.get(row.slug);
    const program = university
      ? await prisma.universityProgram.findUnique({
          where: {
            universityId_level_nameMn: { universityId: university.id, level: ProgramLevel.LANGUAGE_PREP, nameMn: PROGRAM_NAME_MN },
          },
          select: { tuitionPerTermKrw: true, minEnrollmentTerms: true, admissionFeeKrw: true },
        })
      : null;

    const priceChange = program?.tuitionPerTermKrw !== row.perTermKrw ? `  (was ${krw(program?.tuitionPerTermKrw)})` : '';
    console.log(
      `${row.nameKo} ${row.slug}\n  ${krw(row.perTermKrw)}/улирал${priceChange} · элсэхэд ${row.minEnrollmentTerms} улирал = ${krw(row.perTermKrw * row.minEnrollmentTerms)} · бүртгэл ${krw(row.feeKrw)}`,
    );

    if (!dryRun && university) {
      await prisma.university.update({ where: { id: university.id }, data: { acceptsLanguagePrep: true } });
      const prices = {
        tuitionPerTermKrw: row.perTermKrw,
        minEnrollmentTerms: row.minEnrollmentTerms,
        admissionFeeKrw: row.feeKrw,
        tuitionYear: TUITION_YEAR,
        sourceType: ProgramSource.IMPORTED,
        verifiedAt: now,
        internalNote: SOURCE_NOTE,
        isPublished: true,
      };
      await prisma.universityProgram.upsert({
        where: {
          universityId_level_nameMn: { universityId: university.id, level: ProgramLevel.LANGUAGE_PREP, nameMn: PROGRAM_NAME_MN },
        },
        // A language institute runs four terms a year; the annual figure is
        // derived on read (× 4), so none is stored.
        update: { nameEn: PROGRAM_NAME_EN, nameKo: PROGRAM_NAME_KO, ...prices },
        create: {
          universityId: university.id,
          level: ProgramLevel.LANGUAGE_PREP,
          nameMn: PROGRAM_NAME_MN,
          nameEn: PROGRAM_NAME_EN,
          nameKo: PROGRAM_NAME_KO,
          tuitionPerYearKrw: null,
          ...prices,
        },
      });
    }

    for (const round of row.rounds) {
      const key = university
        ? { universityId: university.id, level: ProgramLevel.LANGUAGE_PREP, year: round.year, month: round.month }
        : null;
      const existing = key
        ? await prisma.intakeTerm.findUnique({
            where: { universityId_level_year_month: key },
            select: {
              applicationDeadline: true,
              internalDeadline: true,
              internalDeadlineIsManual: true,
              classStartDate: true,
              openAt: true,
            },
          })
        : null;

      const applicationDeadline = round.deadline ? endOfDayUtc(round.deadline) : null;
      const deadlineMoved = day(existing?.applicationDeadline) !== day(applicationDeadline);
      // A hand-typed internal date is kept only while the school's deadline it
      // was typed against still stands.
      const keepManual = Boolean(existing?.internalDeadlineIsManual) && !deadlineMoved;
      const internalDeadline = resolveInternalDeadline({
        applicationDeadline,
        internalDeadline: keepManual ? (existing?.internalDeadline ?? null) : null,
        internalDeadlineIsManual: keepManual,
        leadDays,
      });
      const status = applicationDeadline ? IntakeStatus.OPEN : IntakeStatus.PLANNED;

      const flags = [
        !existing ? 'new' : null,
        existing && deadlineMoved ? `deadline was ${day(existing.applicationDeadline)}` : null,
        existing?.internalDeadlineIsManual && !keepManual ? `manual internal ${day(existing.internalDeadline)} reset` : null,
        keepManual ? 'manual internal kept' : null,
        status === IntakeStatus.PLANNED ? 'PLANNED — no deadline' : null,
        internalDeadline && internalDeadline < now ? 'ours already past' : null,
        round.fix ? `READ: ${round.fix}` : null,
      ].filter(Boolean);
      console.log(
        `    ${round.year}/${String(round.month).padStart(2)}  open ${round.openAt ?? '—'}  school ${round.deadline ?? '—'}  ours ${day(internalDeadline)}  class ${round.classStart ?? '(kept)'}${flags.length ? `   ← ${flags.join('; ')}` : ''}`,
      );

      if (dryRun || !key) continue;

      const data = {
        openAt: round.openAt ? dateUtc(round.openAt) : null,
        applicationDeadline,
        internalDeadline,
        internalDeadlineIsManual: keepManual,
        // The sheet sometimes gives the months, not the day: keep a known day.
        ...(round.classStart ? { classStartDate: dateUtc(round.classStart) } : {}),
        admissionFeeKrw: row.feeKrw,
        status,
        sourceType: IntakeSource.IMPORTED,
        verifiedAt: now,
      };
      await prisma.intakeTerm.upsert({
        where: { universityId_level_year_month: key },
        update: data,
        create: { ...key, ...data },
      });
      written += 1;
    }
  }

  if (dryRun) {
    console.log('\n[dry] nothing written');
    return;
  }
  console.log(`\nApplied ${ROWS.length} school(s), ${written} round(s).`);
  console.log('Flush the API caches (admissions:*, university:*, universities:*, programs:*) so the site shows it.');
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
