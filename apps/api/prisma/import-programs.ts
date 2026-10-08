/**
 * Programmes, faculties, tuition and scholarships researched off the schools'
 * own websites (1I-10). The plan behind the files is
 * `prisma/program-research-kit/PLAN.md`.
 *
 *   pnpm programs:import                         # apply every file
 *   pnpm programs:import --dry                   # report what would change, write nothing
 *   pnpm programs:import --only korea-university # just these slugs (file names)
 *
 * One JSON file per school under `prisma/data/program-research/<slug>.json`.
 * The shape is `ResearchFile` below. Korean schools publish tuition per fee
 * group (계열), not per department, so a file carries the fee tables once and
 * every programme names its `tuitionGroup`; the figures are spread here.
 * Scholarships are school rules too: each programme gets the highest
 * `headline` rule that applies to its level and fee group as
 * `scholarshipMaxPercent`, and the Mongolian notes of the rules that apply as
 * `scholarshipNote`. The evidence, confidence and the rules that are not a
 * headline stay in the file, under version control.
 *
 * Same contract as `import-intakes.ts`: the rows publish straight away with
 * `sourceType = AI_ASSISTED`, `verifiedAt = null`, and the admin screens badge
 * them. It never overwrites a programme the office has verified — that row is
 * reported with whatever disagrees — and it never renames a faculty staff have
 * already worded in Mongolian. Programmes and faculties are matched by their
 * Korean name (`catalogueNameKey`, 1I-14), so re-running is safe.
 *
 * Rescoring is left to the API, as with `ranking:import`: the cheapest tuition
 * is one of the GKS components.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import {
  InstructionLanguage,
  ProgramLevel,
  ProgramSource,
  PrismaClient,
} from '../src/generated/prisma/client.js';
import { catalogueNameKey } from '../src/modules/programs/catalogue-name.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const onlyIndex = args.indexOf('--only');
const only =
  onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? '').split(',').filter(Boolean)) : null;

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'program-research');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

interface TuitionTable {
  level: ProgramLevel;
  /** The school's fee group (계열), as the programmes below refer to it. */
  group: string;
  /** Per semester, KRW — never the ×2 annual figure. */
  tuitionPerTermKrw: number | null;
  /** 입학금, KRW. 0 when the school charges none; null when unknown. */
  admissionFeeKrw?: number | null;
  /** The academic year of the table. Null when the page names none. */
  tuitionYear: number | null;
  sourceUrl: string;
  evidence?: string;
  confidence?: Confidence;
}

interface ResearchFaculty {
  nameKo: string;
  nameEn?: string | null;
  /** Public, Mongolian. */
  nameMn: string;
}

interface ResearchProgram {
  level: ProgramLevel;
  /** The faculty's `nameKo`, or null for a programme the school files under none. */
  faculty: string | null;
  nameKo: string;
  nameEn?: string | null;
  /** Public, Mongolian — our translation. */
  nameMn: string;
  /** A `tuitionTables[].group` of the same level, or null when the fee is not known. */
  tuitionGroup: string | null;
  durationYears?: number | null;
  language?: InstructionLanguage;
  topikLevel?: number | null;
  ieltsScore?: number | null;
  /** Public, Mongolian. */
  otherRequirements?: string | null;
  sourceUrl: string;
  confidence?: Confidence;
}

interface ResearchScholarship {
  levels: ProgramLevel[];
  /** Fee groups the rule is limited to. Absent = every group of those levels. */
  groups?: string[];
  name: string;
  percent: number | null;
  /** The rule a typical admitted Mongolian student can count on — it sets `scholarshipMaxPercent`. */
  headline: boolean;
  /** Public, Mongolian. Rules without one stay in the file only. */
  noteMn?: string;
  sourceUrl: string;
  evidence?: string;
}

interface ResearchFile {
  slug: string;
  researchedAt: string;
  tuitionTables: TuitionTable[];
  faculties: ResearchFaculty[];
  programs: ResearchProgram[];
  scholarships: ResearchScholarship[];
  notOffered?: ProgramLevel[];
  /** Left out on purpose, with why — for the office, Mongolian. */
  excluded?: { what: string; reason: string }[];
  /** Looked for and not found, with where to look again. */
  pending?: { what: string; reason: string; checkAt?: string }[];
}

function fail(file: string, message: string): never {
  throw new Error(`${file}: ${message}`);
}

/** Public copy is Mongolian and never says where it came from. */
function checkPublic(file: string, id: string, text: string | null | undefined): void {
  if (!text) return;
  if (!/[Ѐ-ӿ]/.test(text))
    fail(file, `${id}: a public field is not in Mongolian — "${text.slice(0, 60)}…"`);
  if (/\bAI\b|Gemini|LLM|эх сурвалж|таамагла/.test(text)) {
    fail(file, `${id}: a public field reads like provenance — "${text.slice(0, 60)}…"`);
  }
}

function validate(file: string, data: ResearchFile): void {
  if (!data.slug || `${data.slug}.json` !== file) fail(file, 'slug must match the file name');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.researchedAt ?? ''))
    fail(file, 'researchedAt must be YYYY-MM-DD');
  const levels = Object.values(ProgramLevel) as string[];
  const languages = Object.values(InstructionLanguage) as string[];

  const groups = new Set<string>();
  for (const table of data.tuitionTables ?? []) {
    const id = `tuition ${table.level}/${table.group}`;
    if (!levels.includes(table.level)) fail(file, `${id}: unknown level`);
    if (groups.has(`${table.level}/${table.group}`)) fail(file, `${id} appears twice`);
    groups.add(`${table.level}/${table.group}`);
    if (
      table.tuitionPerTermKrw !== null &&
      !(Number.isInteger(table.tuitionPerTermKrw) && table.tuitionPerTermKrw > 0)
    ) {
      fail(file, `${id}: tuitionPerTermKrw must be a positive integer`);
    }
    if (table.tuitionPerTermKrw !== null && table.tuitionPerTermKrw > 30_000_000) {
      fail(file, `${id}: ${table.tuitionPerTermKrw} looks like a yearly or multi-term figure`);
    }
    if (table.tuitionYear !== null && !(table.tuitionYear >= 2020 && table.tuitionYear <= 2030))
      fail(file, `${id}: bad tuitionYear`);
    if (!/^https?:\/\//.test(table.sourceUrl ?? '')) fail(file, `${id}: sourceUrl is required`);
  }

  const faculties = new Set<string>();
  for (const faculty of data.faculties ?? []) {
    const key = catalogueNameKey(faculty.nameKo);
    if (!key) fail(file, 'a faculty has no nameKo');
    if (faculties.has(key)) fail(file, `faculty ${faculty.nameKo} appears twice`);
    faculties.add(key);
    checkPublic(file, `faculty ${faculty.nameKo}`, faculty.nameMn);
  }

  const seenKo = new Set<string>();
  const seenMn = new Set<string>();
  for (const program of data.programs ?? []) {
    const id = `${program.level} ${program.nameKo}`;
    if (!levels.includes(program.level)) fail(file, `${id}: unknown level`);
    const key = catalogueNameKey(program.nameKo);
    if (!key) fail(file, `${id}: nameKo is required`);
    if (seenKo.has(`${program.level}/${key}`)) fail(file, `${id} appears twice`);
    seenKo.add(`${program.level}/${key}`);
    // `nameMn` is unique per school and level in the database too.
    if (seenMn.has(`${program.level}/${program.nameMn}`))
      fail(file, `${id}: nameMn "${program.nameMn}" is used twice`);
    seenMn.add(`${program.level}/${program.nameMn}`);
    checkPublic(file, id, program.nameMn);
    checkPublic(file, id, program.otherRequirements);
    if (program.faculty !== null && !faculties.has(catalogueNameKey(program.faculty)!)) {
      fail(file, `${id}: faculty ${program.faculty} is not in faculties`);
    }
    if (program.tuitionGroup !== null && !groups.has(`${program.level}/${program.tuitionGroup}`)) {
      fail(file, `${id}: no ${program.level} tuition table for group ${program.tuitionGroup}`);
    }
    if (program.language && !languages.includes(program.language))
      fail(file, `${id}: unknown language`);
    if (program.topikLevel != null && !(program.topikLevel >= 1 && program.topikLevel <= 6))
      fail(file, `${id}: bad topikLevel`);
    if (!/^https?:\/\//.test(program.sourceUrl ?? '')) fail(file, `${id}: sourceUrl is required`);
  }

  for (const rule of data.scholarships ?? []) {
    const id = `scholarship ${rule.name}`;
    if (!rule.levels?.length || rule.levels.some((level) => !levels.includes(level)))
      fail(file, `${id}: bad levels`);
    if (rule.percent !== null && !(rule.percent > 0 && rule.percent <= 100))
      fail(file, `${id}: percent must be 1–100`);
    if (rule.headline && rule.percent === null)
      fail(file, `${id}: a headline rule needs a percent`);
    for (const group of rule.groups ?? []) {
      if (!rule.levels.some((level) => groups.has(`${level}/${group}`)))
        fail(file, `${id}: unknown group ${group}`);
    }
    checkPublic(file, id, rule.noteMn);
  }
}

/** What the file says one programme should look like. */
function plan(data: ResearchFile, program: ResearchProgram) {
  const table =
    data.tuitionTables.find((t) => t.level === program.level && t.group === program.tuitionGroup) ??
    null;
  const rules = data.scholarships.filter(
    (rule) =>
      rule.levels.includes(program.level) &&
      (!rule.groups ||
        (program.tuitionGroup !== null && rule.groups.includes(program.tuitionGroup))),
  );
  const headline = rules.filter((rule) => rule.headline && rule.percent !== null);
  const notes = rules.map((rule) => rule.noteMn).filter((note): note is string => Boolean(note));
  const sources = [
    `Анги: ${program.sourceUrl}`,
    table ? `Төлбөр (${table.group}): ${table.sourceUrl}` : 'Төлбөр: олдоогүй',
    ...[...new Set(rules.map((rule) => rule.sourceUrl))].map((url) => `Тэтгэлэг: ${url}`),
  ];
  return {
    nameMn: program.nameMn,
    nameEn: program.nameEn ?? null,
    nameKo: program.nameKo,
    durationYears: program.durationYears ?? null,
    tuitionPerTermKrw: table?.tuitionPerTermKrw ?? null,
    admissionFeeKrw: table?.admissionFeeKrw ?? null,
    tuitionYear: table?.tuitionYear ?? null,
    scholarshipMaxPercent: headline.length
      ? Math.max(...headline.map((rule) => rule.percent!))
      : null,
    scholarshipNote: notes.length ? notes.join(' ') : null,
    topikLevel: program.topikLevel ?? null,
    ieltsScore: program.ieltsScore ?? null,
    otherRequirements: program.otherRequirements ?? null,
    language: program.language ?? InstructionLanguage.KOREAN,
    acceptsInternational: true,
    sourceUrl: program.sourceUrl,
    internalNote: `Судалгаа ${data.researchedAt} (${program.confidence ?? 'MEDIUM'}). ${sources.join(' · ')}`,
  };
}

const COMPARED = [
  'tuitionPerTermKrw',
  'admissionFeeKrw',
  'tuitionYear',
  'scholarshipMaxPercent',
  'topikLevel',
  'durationYears',
] as const;

async function importFile(data: ResearchFile) {
  const university = await prisma.university.findUnique({
    where: { slug: data.slug },
    select: { id: true, nameEn: true },
  });
  if (!university) {
    console.log(`  ✗ ${data.slug}: no such university — skipped`);
    return;
  }
  console.log(`\n${university.nameEn} (${data.slug})`);

  // --- Faculties --------------------------------------------------------------
  const existingFaculties = await prisma.faculty.findMany({
    where: { universityId: university.id },
    select: { id: true, nameMn: true, nameEn: true, nameKo: true },
  });
  const facultyByKey = new Map<string, (typeof existingFaculties)[number]>();
  for (const faculty of existingFaculties) {
    const key = catalogueNameKey(faculty.nameKo);
    if (key) facultyByKey.set(key, faculty);
  }
  const facultyId = new Map<string, string>();
  let facultiesCreated = 0;
  let facultiesRenamed = 0;
  for (const faculty of data.faculties) {
    const key = catalogueNameKey(faculty.nameKo)!;
    const row = facultyByKey.get(key);
    if (row) {
      facultyId.set(key, row.id);
      // A faculty research created is named in Korean until somebody words it;
      // one staff have worded is theirs.
      if (catalogueNameKey(row.nameMn) === key && row.nameMn !== faculty.nameMn) {
        facultiesRenamed++;
        if (!dryRun) {
          await prisma.faculty.update({
            where: { id: row.id },
            data: { nameMn: faculty.nameMn, nameEn: row.nameEn ?? faculty.nameEn ?? null },
          });
        }
      }
      continue;
    }
    facultiesCreated++;
    if (dryRun) {
      facultyId.set(key, `dry:${key}`);
      continue;
    }
    const created = await prisma.faculty.create({
      data: {
        universityId: university.id,
        nameMn: faculty.nameMn,
        nameEn: faculty.nameEn ?? null,
        nameKo: faculty.nameKo,
        sortOrder: (data.faculties.indexOf(faculty) + 1) * 10,
      },
      select: { id: true },
    });
    facultyId.set(key, created.id);
  }
  console.log(
    `  танхим: ${facultiesCreated} шинэ, ${facultiesRenamed} монгол нэр өгсөн, ${data.faculties.length - facultiesCreated} байсан`,
  );

  // --- Programmes -------------------------------------------------------------
  const existing = await prisma.universityProgram.findMany({
    where: { universityId: university.id },
    select: {
      id: true,
      level: true,
      nameMn: true,
      nameKo: true,
      verifiedAt: true,
      sourceType: true,
      tuitionPerTermKrw: true,
      admissionFeeKrw: true,
      tuitionYear: true,
      scholarshipMaxPercent: true,
      topikLevel: true,
      durationYears: true,
    },
  });
  const byKey = new Map(
    existing.map((row) => [`${row.level}/${catalogueNameKey(row.nameKo)}`, row]),
  );
  // A row entered without a Korean name is found by its Mongolian one instead —
  // creating beside it would collide on (school, level, nameMn).
  const byMn = new Map(
    existing.filter((row) => !row.nameKo).map((row) => [`${row.level}/${row.nameMn}`, row]),
  );

  const counts = { created: 0, updated: 0, verified: 0 };
  const touched = new Set<string>();
  for (const program of data.programs) {
    const key = `${program.level}/${catalogueNameKey(program.nameKo)}`;
    const values = plan(data, program);
    const faculty = program.faculty
      ? (facultyId.get(catalogueNameKey(program.faculty)!) ?? null)
      : null;
    const row = byKey.get(key) ?? byMn.get(`${program.level}/${program.nameMn}`);

    if (row?.verifiedAt) {
      // The office's word stands; say where the research disagrees.
      counts.verified++;
      touched.add(row.id);
      const diffs = COMPARED.filter(
        (field) => values[field] !== null && values[field] !== row[field],
      ).map((field) => `${field} ${row[field] ?? '—'} → ${values[field]}`);
      console.log(
        `  = ${program.level} ${program.nameKo}: баталгаажсан, хөндсөнгүй${diffs.length ? ` (зөрүү: ${diffs.join(', ')})` : ''}`,
      );
      continue;
    }

    const data_ = {
      ...values,
      facultyId: faculty?.startsWith('dry:') ? null : faculty,
      sourceType: ProgramSource.AI_ASSISTED,
      verifiedAt: null,
      isPublished: true,
    };
    if (row) {
      counts.updated++;
      touched.add(row.id);
      if (!dryRun) await prisma.universityProgram.update({ where: { id: row.id }, data: data_ });
    } else {
      counts.created++;
      if (!dryRun) {
        await prisma.universityProgram.create({
          data: { ...data_, universityId: university.id, level: program.level },
        });
      }
    }
  }
  console.log(
    `  анги: ${counts.created} шинэ, ${counts.updated} шинэчилсэн, ${counts.verified} баталгаажсан (хөндөөгүй)`,
  );

  const strays = existing.filter((row) => !touched.has(row.id) && !row.verifiedAt);
  if (strays.length) {
    console.log(`  ! файлд байхгүй, баталгаажаагүй ${strays.length} анги үлдсэн (устгаагүй):`);
    for (const row of strays) console.log(`      ${row.level} ${row.nameKo ?? row.nameMn}`);
  }
  for (const item of data.pending ?? []) console.log(`  … ${item.what}: ${item.reason}`);
}

async function main(): Promise<void> {
  const files = readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !only || only.has(name.slice(0, -'.json'.length)))
    .sort();
  if (only && files.length !== only.size) {
    throw new Error(
      `--only: no file for ${[...only].filter((slug) => !files.includes(`${slug}.json`)).join(', ')}`,
    );
  }

  // Validate every file before writing anything.
  const parsed = files.map((file) => {
    const data = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as ResearchFile;
    validate(file, data);
    return { file, data };
  });
  console.log(`${parsed.length} файл зөв.${dryRun ? ' (--dry: юу ч бичихгүй)' : ''}`);

  for (const { data } of parsed) await importFile(data);

  console.log(
    `\nDone. Run POST /admin/universities/ranking/recompute (or wait for the nightly job) — the cheapest tuition is a GKS component.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
