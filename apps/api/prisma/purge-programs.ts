/**
 * One-off reset of the degree catalogue before the 1I-10 research refills it
 * (business decision 2026-10-08, `program-research-kit/PLAN.md` §5, §7).
 *
 *   pnpm exec tsx prisma/purge-programs.ts            # dry run, reports only
 *   pnpm exec tsx prisma/purge-programs.ts --commit   # backs up, then deletes
 *
 * What goes:
 *  - every BACHELOR / MASTER / PHD `UniversityProgram` — their
 *    `IntakeProgramOverride` rows cascade with them; a case, case choice or
 *    application that pointed at one keeps its row and loses the link (SetNull)
 *  - every `Faculty`
 *  - every `ProgramResearchRun` (the Gemini path's candidates)
 *
 * What stays: every LANGUAGE_PREP programme — the office's own figures for the
 * nine schools it brokers (`import-language-prep.ts`) stand until the research
 * covers them.
 *
 * The rows are written to `.backups/purge-programs-<stamp>/` at the repo root
 * before anything is deleted, and the delete is one transaction.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { ProgramLevel, PrismaClient } from '../src/generated/prisma/client.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const commit = process.argv.includes('--commit');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const degree = { level: { not: ProgramLevel.LANGUAGE_PREP } };

async function main(): Promise<void> {
  const [programs, faculties, runs, overrides, cases, choices, applications, languagePrep] =
    await Promise.all([
      prisma.universityProgram.findMany({ where: degree }),
      prisma.faculty.findMany(),
      prisma.programResearchRun.findMany(),
      prisma.intakeProgramOverride.findMany({ where: { program: degree } }),
      prisma.case.findMany({
        where: { program: degree },
        select: { id: true, code: true, programId: true },
      }),
      prisma.caseUniversityChoice.findMany({
        where: { program: degree },
        select: { id: true, caseId: true, programId: true },
      }),
      prisma.application.findMany({
        where: { program: degree },
        select: { id: true, caseId: true, programId: true },
      }),
      prisma.universityProgram.count({ where: { level: ProgramLevel.LANGUAGE_PREP } }),
    ]);

  const byLevel = new Map<string, number>();
  for (const program of programs) byLevel.set(program.level, (byLevel.get(program.level) ?? 0) + 1);
  const schools = new Set(programs.map((program) => program.universityId)).size;
  const verified = programs.filter((program) => program.verifiedAt).length;

  console.log(
    `Устгах анги: ${programs.length} (${[...byLevel].map(([level, n]) => `${level} ${n}`).join(', ') || '—'}), ${schools} сургууль, үүнээс баталгаажсан ${verified}`,
  );
  console.log(`Устгах танхим: ${faculties.length}`);
  console.log(`Устгах судалгааны run: ${runs.length}`);
  console.log(`Хамт устах элсэлтийн override: ${overrides.length}`);
  console.log(
    `Холбоос нь салах: хэрэг ${cases.length}, сонголт ${choices.length}, мэдүүлэг ${applications.length}`,
  );
  for (const row of cases) console.log(`    хэрэг ${row.code}`);
  console.log(`Үлдэх хэлний бэлтгэлийн анги: ${languagePrep}`);

  if (!commit) {
    console.log('\nDry run — юу ч устгаагүй. --commit-оор ажиллуулна.');
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(process.cwd(), '..', '..', '.backups', `purge-programs-${stamp}`);
  await mkdir(backupDir, { recursive: true });
  const backup = { programs, faculties, runs, overrides, cases, choices, applications };
  for (const [name, rows] of Object.entries(backup)) {
    await writeFile(join(backupDir, `${name}.json`), JSON.stringify(rows, null, 2));
  }

  // Atomic on purpose: half a catalogue is worse than either end state.
  await prisma.$transaction([
    prisma.universityProgram.deleteMany({ where: degree }),
    prisma.faculty.deleteMany(),
    prisma.programResearchRun.deleteMany(),
  ]);
  console.log('\nУстгалаа. Нөөц:', backupDir);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
