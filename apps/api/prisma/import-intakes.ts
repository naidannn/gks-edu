/**
 * Intake rounds researched off the schools' own websites (1H-12).
 *
 *   pnpm intakes:import                      # apply every file
 *   pnpm intakes:import --dry                # report what would change, write nothing
 *   pnpm intakes:import --only snu,konkuk    # just these slugs (file names)
 *   pnpm intakes:import --records-only       # only what each read found, rounds untouched
 *
 * One JSON file per school under `prisma/data/intake-research/<slug>.json`,
 * written by a person or an agent reading the school's 모집요강 in a browser.
 * The shape is `ResearchFile` below; everything that is not a public field —
 * the Korean quote the date was read off, the confidence, the second round —
 * stays in that file, under version control, and never reaches the database.
 *
 * The business decided (2026-10-08) that these rounds publish straight away:
 * they are written `OPEN`, `sourceType = AI_ASSISTED`, `verifiedAt = null`.
 * The admin screens badge them "AI судалсан"; the public payload carries
 * neither field, so a visitor sees an ordinary round.
 *
 * What it never does:
 *  - overwrite a round the office has verified (`verifiedAt` set) — that row is
 *    reported, with any date that disagrees, and left alone;
 *  - move an internal deadline a human typed (`internalDeadlineIsManual`);
 *  - put provenance in `note`, which the public page prints verbatim
 *    (`gotcha_intake_note_is_public`). A file's `note` is client-facing copy.
 *
 * Before the files, it strips the research caveat the Gemini path used to
 * append to `note` (1H-14) from every row, verified or not: that sentence was
 * written for a reviewer and has been showing on the public site.
 *
 * Every file also writes the school's `IntakeResearchRecord` — when it was
 * read, the levels it does not offer, and the rounds still pending — which is
 * how the progress page tells "researched, nothing found" from "never looked
 * at". `--records-only` writes just those, for a database whose rounds have
 * since been edited by hand.
 *
 * Re-running is safe: writes are upserts keyed on (university, level, year,
 * month), and a file that has not changed writes the same values again.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { IntakeSource, IntakeStatus, ProgramLevel, PrismaClient } from '../src/generated/prisma/client.js';
import {
  DEFAULT_INTERNAL_LEAD_DAYS,
  INTAKE_MONTHS_BY_LEVEL,
  resolveInternalDeadline,
} from '../src/modules/admissions/intake-deadline.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const recordsOnly = args.includes('--records-only');
const onlyIndex = args.indexOf('--only');
const only = onlyIndex >= 0 ? new Set((args[onlyIndex + 1] ?? '').split(',').filter(Boolean)) : null;

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), 'data', 'intake-research');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** The sentence `intake-candidate.parser.ts` used to prepend to an ungrounded candidate's note. */
const RESEARCH_CAVEAT =
  'Google хайлт хийгдээгүй тул огноог загвар санамжаасаа бичсэн — эх сурвалж дээр нь заавал шалгана уу.';

interface ResearchRound {
  level: ProgramLevel;
  year: number;
  /** 3, 6, 9 or 12 — the month classes start, which names the intake. */
  month: number;
  /** All dates are `YYYY-MM-DD` as the school publishes them (KST). */
  openAt?: string | null;
  /** The school's last day. Required — a round without one is not worth publishing. */
  applicationDeadline: string;
  classStartDate?: string | null;
  resultAnnouncedAt?: string | null;
  quota?: number | null;
  /** 전형료 — the application fee, KRW. Not 입학금. */
  admissionFeeKrw?: number | null;
  /** Public, Mongolian (enforced): what this round asks for beyond the standard set. */
  requirementNote?: string | null;
  /** Public, Mongolian. Never provenance. */
  note?: string | null;
  /** The page or PDF the dates were read off. Required. */
  sourceUrl: string;
  // --- Staff-only, never written to the database ---
  /** The Korean line(s) the dates were read off, verbatim. */
  evidence?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  /** A later round (2차, 3차) of the same intake — the row stores the first. */
  laterRounds?: string;
}

interface ResearchFile {
  slug: string;
  /** `YYYY-MM-DD` the pages were read. */
  researchedAt: string;
  rounds: ResearchRound[];
  /** Levels the school does not run for foreigners — recorded so nobody re-researches them. */
  notOffered?: ProgramLevel[];
  /** Rounds looked for and not yet published, with where to look again. `reason` is in Mongolian for the office. */
  pending?: { level: ProgramLevel; year: number; month: number; reason: string; checkUrl?: string }[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(file: string, message: string): never {
  throw new Error(`${file}: ${message}`);
}

function checkDate(file: string, field: string, value: unknown, required = false): void {
  if (value === null || value === undefined) {
    if (required) fail(file, `${field} is required`);
    return;
  }
  if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value))) {
    fail(file, `${field} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  }
}

function validate(file: string, data: ResearchFile): void {
  if (!data.slug || `${data.slug}.json` !== file) fail(file, `slug must match the file name`);
  checkDate(file, 'researchedAt', data.researchedAt, true);
  if (!Array.isArray(data.rounds)) fail(file, 'rounds must be an array');
  const levels = Object.values(ProgramLevel) as string[];
  for (const level of data.notOffered ?? []) if (!levels.includes(level)) fail(file, `notOffered: unknown level ${level}`);
  for (const pending of data.pending ?? []) {
    // Read back by the progress page, so it is held to the shape it expects.
    if (!levels.includes(pending.level)) fail(file, `pending: unknown level ${pending.level}`);
    if (!Number.isInteger(pending.year) || !Number.isInteger(pending.month)) fail(file, `pending ${pending.level}: bad year/month`);
    if (typeof pending.reason !== 'string' || !pending.reason.trim()) fail(file, `pending ${pending.level}: reason is required`);
  }
  const seen = new Set<string>();
  for (const round of data.rounds) {
    const id = `${round.level} ${round.year}/${round.month}`;
    if (!Object.values(ProgramLevel).includes(round.level)) fail(file, `unknown level ${round.level}`);
    if (!INTAKE_MONTHS_BY_LEVEL[round.level].includes(round.month as 3 | 6 | 9 | 12)) {
      fail(file, `${id}: month ${round.month} is not an intake month for ${round.level}`);
    }
    if (!Number.isInteger(round.year) || round.year < 2025 || round.year > 2030) fail(file, `${id}: bad year`);
    if (seen.has(id)) fail(file, `${id} appears twice`);
    seen.add(id);
    checkDate(file, `${id} applicationDeadline`, round.applicationDeadline, true);
    checkDate(file, `${id} openAt`, round.openAt);
    checkDate(file, `${id} classStartDate`, round.classStartDate);
    checkDate(file, `${id} resultAnnouncedAt`, round.resultAnnouncedAt);
    if (!round.sourceUrl || !/^https?:\/\//.test(round.sourceUrl)) fail(file, `${id}: sourceUrl is required`);
    if (round.openAt && round.openAt > round.applicationDeadline) fail(file, `${id}: openAt after the deadline`);
    if (round.classStartDate && round.classStartDate < round.applicationDeadline) {
      fail(file, `${id}: classes start before the deadline`);
    }
    for (const text of [round.note, round.requirementNote]) {
      // Both are printed on the public page, so they are written in Mongolian.
      if (text && !/[\u0400-\u04FF]/.test(text)) fail(file, `${id}: a public field is not in Mongolian — "${text.slice(0, 60)}…"`);
      if (text && /\bAI\b|Gemini|LLM|эх сурвалж|таамагла/.test(text)) {
        fail(file, `${id}: a public field reads like provenance — "${text.slice(0, 60)}…"`);
      }
    }
  }
}

/** A deadline is the whole of its last day, in UTC — the convention the module already uses. */
function endOfDayUtc(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, 23, 59, 59));
}

function dateUtc(date: string | null | undefined): Date | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

const ymd = (date: Date | null | undefined): string => (date ? date.toISOString().slice(0, 10) : '—');

/** 1H-14: take the reviewer's caveat out of every public note. */
async function stripResearchCaveats(): Promise<void> {
  const rows = await prisma.intakeTerm.findMany({
    where: { note: { contains: RESEARCH_CAVEAT } },
    select: { id: true, note: true },
  });
  console.log(`${dryRun ? '[dry] would strip' : 'Stripping'} the research caveat from ${rows.length} public note(s)`);
  if (dryRun) return;
  for (const row of rows) {
    const note = row.note!.replace(RESEARCH_CAVEAT, '').trim();
    await prisma.intakeTerm.update({ where: { id: row.id }, data: { note: note || null } });
  }
}

function readFiles(): ResearchFile[] {
  const files = readdirSync(DATA_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !only || only.has(name.slice(0, -'.json'.length)))
    .sort();
  if (only) {
    const missing = [...only].filter((slug) => !files.includes(`${slug}.json`));
    if (missing.length) throw new Error(`No research file for: ${missing.join(', ')}`);
  }
  return files.map((name) => {
    const data = JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8')) as ResearchFile;
    validate(name, data);
    return data;
  });
}

async function main(): Promise<void> {
  const files = readFiles();
  const universities = await prisma.university.findMany({
    where: { slug: { in: files.map((file) => file.slug) } },
    select: { id: true, slug: true, nameEn: true },
  });
  const bySlug = new Map(universities.map((university) => [university.slug, university]));
  const missing = files.filter((file) => !bySlug.has(file.slug));
  if (missing.length) throw new Error(`Not in the catalogue: ${missing.map((file) => file.slug).join(', ')}`);

  if (!recordsOnly) await stripResearchCaveats();

  const config = await prisma.admissionConfig.findUnique({ where: { id: 'default' } });
  const leadDays = config?.internalLeadDays ?? DEFAULT_INTERNAL_LEAD_DAYS;
  const now = new Date();
  const counts = { created: 0, updated: 0, keptVerified: 0, records: 0 };

  console.log(`\nInternal deadlines run ${leadDays} day(s) ahead of the school's.`);

  for (const file of files) {
    const university = bySlug.get(file.slug)!;
    console.log(`\n${university.nameEn} (${file.slug}) — read ${file.researchedAt}`);

    for (const round of recordsOnly ? [] : file.rounds) {
      const key = {
        universityId: university.id,
        level: round.level,
        year: round.year,
        month: round.month,
      };
      const existing = await prisma.intakeTerm.findUnique({
        where: { universityId_level_year_month: key },
        select: {
          applicationDeadline: true,
          internalDeadline: true,
          internalDeadlineIsManual: true,
          verifiedAt: true,
        },
      });
      const applicationDeadline = endOfDayUtc(round.applicationDeadline);
      const label = `  ${round.level.padEnd(13)} ${round.year}/${String(round.month).padStart(2)}`;

      if (existing?.verifiedAt) {
        counts.keptVerified++;
        const differs = ymd(existing.applicationDeadline) !== round.applicationDeadline;
        console.log(
          `${label}  kept (verified ${ymd(existing.verifiedAt)})${differs ? `  ← school page says ${round.applicationDeadline}, row has ${ymd(existing.applicationDeadline)}` : ''}`,
        );
        continue;
      }

      const internalDeadline = resolveInternalDeadline({
        applicationDeadline,
        internalDeadline: existing?.internalDeadline ?? null,
        internalDeadlineIsManual: existing?.internalDeadlineIsManual ?? false,
        leadDays,
      });
      const past = internalDeadline && internalDeadline < now ? '  ← ours already past' : '';
      console.log(
        `${label}  ${existing ? 'update' : 'create'}  school ${round.applicationDeadline}  ours ${ymd(internalDeadline)}${past}`,
      );
      counts[existing ? 'updated' : 'created']++;
      if (dryRun) continue;

      // The research replaces the whole row's content: an unverified row's
      // old note was the guess this research supersedes.
      const data = {
        openAt: dateUtc(round.openAt),
        applicationDeadline,
        internalDeadline,
        classStartDate: dateUtc(round.classStartDate),
        resultAnnouncedAt: dateUtc(round.resultAnnouncedAt),
        quota: round.quota ?? null,
        admissionFeeKrw: round.admissionFeeKrw ?? null,
        requirementNote: round.requirementNote ?? null,
        note: round.note ?? null,
        status: IntakeStatus.OPEN,
        sourceUrl: round.sourceUrl,
        sourceType: IntakeSource.AI_ASSISTED,
        verifiedAt: null,
        verifiedById: null,
      };
      await prisma.intakeTerm.upsert({
        where: { universityId_level_year_month: key },
        update: data,
        create: { ...key, ...data },
      });
    }

    for (const level of file.notOffered ?? []) console.log(`  ${level.padEnd(13)} not offered`);
    for (const pending of file.pending ?? []) {
      console.log(`  ${pending.level.padEnd(13)} ${pending.year}/${String(pending.month).padStart(2)}  pending — ${pending.reason}`);
    }

    counts.records++;
    if (dryRun) continue;
    const record = {
      researchedAt: dateUtc(file.researchedAt)!,
      roundsFound: file.rounds.length,
      notOffered: file.notOffered ?? [],
      pending: (file.pending ?? []).map(({ level, year, month, reason, checkUrl }) => ({
        level,
        year,
        month,
        reason,
        ...(checkUrl ? { checkUrl } : {}),
      })),
    };
    await prisma.intakeResearchRecord.upsert({
      where: { universityId: university.id },
      update: record,
      create: { universityId: university.id, ...record },
    });
  }

  console.log(
    `\n${dryRun ? '[dry] would create' : 'Created'} ${counts.created}, ${dryRun ? 'update' : 'updated'} ${counts.updated}, kept ${counts.keptVerified} verified round(s) across ${files.length} school(s); ${dryRun ? 'would write' : 'wrote'} ${counts.records} research record(s).`,
  );
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
