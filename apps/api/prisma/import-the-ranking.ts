/**
 * Writes the Times Higher Education "South Korea Rank" onto the catalogue.
 *
 *   pnpm ranking:import          # apply the table, then recompute is left to the API
 *   pnpm ranking:import --dry    # report what would change, write nothing
 *
 * The table itself lives in `src/modules/universities/ranking/the-korea-ranking.ts`
 * — edit it there when the next edition is published, bump `THE_RANKING_YEAR`,
 * and re-run this.
 *
 * Re-running is safe and idempotent: every school's three THE columns are
 * cleared first, so a school that dropped out of the table this year ends up
 * `null` ("рэйтингд ороогүй") rather than keeping last year's rank.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import {
  THE_KOREA_RANKING_2026,
  THE_RANKING_YEAR,
} from '../src/modules/universities/ranking/the-korea-ranking.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const rows = THE_KOREA_RANKING_2026.filter((row) => row.slug !== null);
  const skipped = THE_KOREA_RANKING_2026.filter((row) => row.slug === null);

  const known = await prisma.university.findMany({
    where: { slug: { in: rows.map((row) => row.slug!) } },
    select: { id: true, slug: true, nameMn: true, theKoreaRank: true },
  });
  const bySlug = new Map(known.map((university) => [university.slug, university]));

  const missing = rows.filter((row) => !bySlug.has(row.slug!));
  const cleared = await prisma.university.count({
    where: { theKoreaRank: { not: null }, slug: { notIn: rows.map((row) => row.slug!) } },
  });

  console.log(`THE South Korea Rank ${THE_RANKING_YEAR}`);
  console.log(`  ${rows.length} ranked schools in the table, ${bySlug.size} matched in the catalogue`);
  if (skipped.length) {
    console.log(`  not carried by us: ${skipped.map((row) => `${row.nameEn} (#${row.koreaRank})`).join(', ')}`);
  }
  if (missing.length) {
    console.log(`  slug not found: ${missing.map((row) => row.slug).join(', ')}`);
  }
  if (cleared) console.log(`  ${cleared} school(s) will lose a rank they no longer hold`);

  if (dryRun) {
    console.log('\n--dry: nothing written.');
    return;
  }

  const matched = rows.filter((row) => bySlug.has(row.slug!));
  const matchedSlugs = matched.map((row) => row.slug!);

  // Two statements, not forty-one. The database is a Supabase pooler ~115 ms
  // away and an interactive transaction times out after 5 s, so a per-school
  // `update()` loop does not survive the round trips (CLAUDE.md, hard rule 8).
  await prisma.$transaction([
    prisma.university.updateMany({
      where: {
        slug: { notIn: matchedSlugs },
        OR: [{ theKoreaRank: { not: null } }, { theRankYear: { not: null } }],
      },
      data: { theKoreaRank: null, theWorldRank: null, theRankYear: null },
    }),
    prisma.$executeRaw`
      UPDATE "universities" AS u
         SET "theKoreaRank" = r.korea_rank,
             "theWorldRank" = r.world_rank,
             "theRankYear"  = r.rank_year
        FROM (VALUES ${Prisma.join(
          matched.map(
            (row) =>
              Prisma.sql`(${row.slug}::text, ${row.koreaRank}::integer, ${row.worldRank}::text, ${THE_RANKING_YEAR}::integer)`,
          ),
        )}) AS r(slug, korea_rank, world_rank, rank_year)
       WHERE u."slug" = r.slug
    `,
  ]);

  console.log(`\nDone. Run POST /admin/universities/ranking/recompute (or wait for the nightly job) to refresh gksRank.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
