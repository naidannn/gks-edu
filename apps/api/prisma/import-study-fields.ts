/**
 * Seeds the canonical subject taxonomy — the list that makes "маркетинг" one
 * question instead of 135.
 *
 *   pnpm study-fields:import          # create what is missing, add new aliases
 *   pnpm study-fields:import --dry    # report what would change, write nothing
 *   pnpm study-fields:import --match  # then re-run the matcher over the catalogue
 *
 * Re-running is safe and deliberately conservative: an existing field keeps its
 * Mongolian name, its sort order and every alias staff added by hand. The
 * importer only creates rows that are absent and appends aliases the row does
 * not already carry — because after the first import this table belongs to the
 * office, not to this file.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { STUDY_FIELD_TAXONOMY, type StudyFieldSeed } from '../src/modules/programs/study-fields.data.js';
import {
  buildStudyFieldIndex,
  matchStudyField,
  normaliseProgramName,
} from '../src/modules/programs/study-field.matcher.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry');
const alsoMatch = args.includes('--match');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  console.log(`Судлах чиглэлийн жагсаалт${dryRun ? ' (dry run — юу ч бичихгүй)' : ''}`);

  let created = 0;
  let aliasesAdded = 0;

  for (const [groupIndex, group] of STUDY_FIELD_TAXONOMY.entries()) {
    const groupId = await upsert(group, null, (groupIndex + 1) * 100);

    for (const [childIndex, child] of (group.children ?? []).entries()) {
      await upsert(child, groupId, (groupIndex + 1) * 100 + childIndex + 1);
    }
  }

  console.log(`  ${created} чиглэл шинээр үүслээ, ${aliasesAdded} нэршил нэмэгдлээ`);

  if (alsoMatch) await rematch();

  async function upsert(seed: StudyFieldSeed, parentId: string | null, sortOrder: number): Promise<string> {
    const existing = await prisma.studyField.findUnique({
      where: { slug: seed.slug },
      select: { id: true, aliases: true },
    });

    if (!existing) {
      created += 1;
      if (dryRun) {
        console.log(`  + ${seed.slug} — ${seed.nameMn}`);
        // A placeholder id: nothing is written, and the children of a dry-run
        // group are only being counted.
        return seed.slug;
      }
      const field = await prisma.studyField.create({
        data: {
          slug: seed.slug,
          nameMn: seed.nameMn,
          nameEn: seed.nameEn,
          nameKo: seed.nameKo ?? null,
          aliases: seed.aliases ?? [],
          parentId,
          sortOrder,
        },
        select: { id: true },
      });
      return field.id;
    }

    // Aliases are additive: the office's own entries are never removed, and a
    // wording this file learned since the last run is picked up.
    const known = new Set(existing.aliases.map((alias) => normaliseProgramName(alias)));
    const fresh = (seed.aliases ?? []).filter((alias) => !known.has(normaliseProgramName(alias)));
    if (fresh.length) {
      aliasesAdded += fresh.length;
      if (dryRun) console.log(`  ~ ${seed.slug}: + ${fresh.join(', ')}`);
      else await prisma.studyField.update({ where: { id: existing.id }, data: { aliases: { push: fresh } } });
    }

    return existing.id;
  }
}

/** Files every unclassified programme the matcher recognises. */
async function rematch(): Promise<void> {
  const fields = await prisma.studyField.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, nameMn: true, nameEn: true, nameKo: true, aliases: true, parentId: true },
  });
  const index = buildStudyFieldIndex(fields);

  const programs = await prisma.universityProgram.findMany({
    where: { studyFieldId: null },
    select: { id: true, nameMn: true, nameEn: true, nameKo: true, faculty: true },
  });

  const byField = new Map<string, string[]>();
  for (const program of programs) {
    const hit = matchStudyField(index, [program.nameKo, program.nameEn, program.nameMn, program.faculty]);
    if (!hit) continue;
    byField.set(hit.fieldId, [...(byField.get(hit.fieldId) ?? []), program.id]);
  }

  const matched = [...byField.values()].reduce((total, ids) => total + ids.length, 0);
  console.log(`  ${programs.length} ангилаагүй хөтөлбөрөөс ${matched} нь таарлаа`);

  if (dryRun || matched === 0) return;
  for (const [fieldId, ids] of byField) {
    await prisma.universityProgram.updateMany({ where: { id: { in: ids } }, data: { studyFieldId: fieldId } });
  }
  console.log('  бичигдлээ.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
