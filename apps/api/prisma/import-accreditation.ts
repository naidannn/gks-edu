/**
 * Writes the Ministry of Education's international-student certification onto
 * the catalogue.
 *
 *   pnpm accreditation:import          # apply both lists
 *   pnpm accreditation:import --dry    # report what would change, write nothing
 *
 * The lists themselves live in
 * `src/modules/universities/accreditation/korea-accreditation.ts` — replace
 * them there when the next cycle is published, then re-run this.
 *
 * Re-running is safe and idempotent: every school is reset to `NONE` first, so
 * a school dropped from this cycle's lists ends up uncertified rather than
 * keeping the previous cycle's grade.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { AccreditationGrade, PrismaClient } from '../src/generated/prisma/client.js';
import {
  CERTIFIED_ACCREDITED,
  EXCELLENT_ACCREDITED,
  type AccreditationRow,
} from '../src/modules/universities/accreditation/korea-accreditation.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const LISTS: [AccreditationGrade, AccreditationRow[]][] = [
  [AccreditationGrade.EXCELLENT, EXCELLENT_ACCREDITED],
  [AccreditationGrade.CERTIFIED, CERTIFIED_ACCREDITED],
];

async function main(): Promise<void> {
  const known = new Map(
    (await prisma.university.findMany({ select: { slug: true, nameEn: true, accreditation: true } })).map(
      (university) => [university.slug, university],
    ),
  );

  const wanted = new Map<string, AccreditationGrade>();
  const unmatched: { grade: AccreditationGrade; row: AccreditationRow }[] = [];

  for (const [grade, rows] of LISTS) {
    for (const row of rows) {
      if (!known.has(row.slug)) {
        unmatched.push({ grade, row });
        continue;
      }
      const already = wanted.get(row.slug);
      if (already && already !== grade) {
        throw new Error(`${row.slug} appears on both lists — resolve it in korea-accreditation.ts`);
      }
      wanted.set(row.slug, grade);
    }
  }

  const changes = [...known.values()]
    .map((university) => ({
      slug: university.slug,
      nameEn: university.nameEn,
      from: university.accreditation,
      to: wanted.get(university.slug) ?? AccreditationGrade.NONE,
    }))
    .filter((change) => change.from !== change.to);

  for (const change of changes) {
    console.log(`  ${change.from} → ${change.to}  ${change.nameEn}`);
  }
  for (const miss of unmatched) {
    console.warn(`  ! no catalogue match: ${miss.row.nameKo} / ${miss.row.nameEn} (${miss.row.slug})`);
  }

  if (dryRun) {
    console.log(`\n[dry] ${changes.length} school(s) would change, ${unmatched.length} unmatched`);
    return;
  }

  // One statement per grade rather than 135 updates — the pooler is ~115 ms away.
  await prisma.$transaction([
    prisma.university.updateMany({
      where: { slug: { notIn: [...wanted.keys()] } },
      data: { accreditation: AccreditationGrade.NONE },
    }),
    ...LISTS.map(([grade, rows]) =>
      prisma.university.updateMany({
        where: { slug: { in: rows.filter((row) => known.has(row.slug)).map((row) => row.slug) } },
        data: { accreditation: grade },
      }),
    ),
  ]);

  const totals = await prisma.university.groupBy({ by: ['accreditation'], _count: true });
  console.log(`\nApplied ${changes.length} change(s). Catalogue now:`);
  for (const total of totals.sort((a, b) => a.accreditation.localeCompare(b.accreditation))) {
    console.log(`  ${total.accreditation.padEnd(9)} ${total._count}`);
  }
  if (unmatched.length) {
    console.warn(`${unmatched.length} listed school(s) are not in the catalogue — see above.`);
  }
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
