/**
 * Replaces the universal visa-stage rule base with the office's list (1F-12).
 *
 *   pnpm visa-requirements:import          # apply
 *   pnpm visa-requirements:import --dry    # report what would change, write nothing
 *
 * The list lives in `data/visa-requirements.ts`. This exists because
 * `prisma:seed` must never run against production (it also writes placeholder
 * intake rounds); it touches only what the visa list owns:
 *   - upserts the visa templates (wording updated, an admin's `isActive` kept);
 *   - deletes every universal (`universityId = null`) VISA rule and recreates
 *     the list's. A rule an admin attached to one school (1D-18) is left alone.
 *
 * Existing cases keep their checklist until staff re-resolve it — the engine
 * then appends the new papers and withdraws only rows nobody has worked on.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { DocStage, PrismaClient } from '../src/generated/prisma/client.js';
import { VISA_DOCUMENT_TEMPLATES, visaRules } from './data/visa-requirements.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const rules = visaRules();
  const ownCodes = new Set(VISA_DOCUMENT_TEMPLATES.map((template) => template.code));
  const referenced = [...new Set(rules.map(([code]) => code))];

  const [existingTemplates, existingRules] = await Promise.all([
    prisma.documentTemplate.findMany({
      where: { code: { in: [...new Set([...ownCodes, ...referenced])] } },
    }),
    prisma.requirementRule.findMany({
      where: { stage: DocStage.VISA, universityId: null },
      include: { template: { select: { code: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
  ]);
  const byCode = new Map(existingTemplates.map((template) => [template.code, template]));

  // The admission templates the list reuses are seed.ts's to create.
  const missing = referenced.filter((code) => !ownCodes.has(code) && !byCode.has(code));
  if (missing.length) {
    throw new Error(
      `Templates the visa list reuses are not in this database: ${missing.join(', ')}`,
    );
  }

  for (const template of VISA_DOCUMENT_TEMPLATES) {
    const current = byCode.get(template.code);
    if (!current) console.log(`  + template ${template.code}  ${template.nameMn}`);
    else if (current.nameMn !== template.nameMn)
      console.log(`  ~ template ${template.code}  ${current.nameMn} → ${template.nameMn}`);
  }
  console.log(
    `\n  - ${existingRules.length} universal visa rule(s): ${existingRules.map((rule) => rule.template.code).join(', ')}`,
  );
  console.log(`  + ${rules.length} rule(s) from the office's list`);

  if (dryRun) {
    console.log('\n[dry] nothing written');
    return;
  }

  const ids = new Map(existingTemplates.map((template) => [template.code, template.id]));
  for (const template of VISA_DOCUMENT_TEMPLATES) {
    const row = await prisma.documentTemplate.upsert({
      where: { code: template.code },
      update: { ...template, isActive: undefined },
      create: template,
      select: { id: true },
    });
    ids.set(template.code, row.id);
  }

  // Atomic: between the delete and the insert, a resolve would hand a client an
  // empty visa list.
  await prisma.$transaction([
    prisma.requirementRule.deleteMany({ where: { stage: DocStage.VISA, universityId: null } }),
    prisma.requirementRule.createMany({
      data: rules.map(([code, rule]) => ({ ...rule, templateId: ids.get(code)! })),
    }),
  ]);

  console.log(
    `\nApplied: ${VISA_DOCUMENT_TEMPLATES.length} template(s) upserted, ${rules.length} visa rule(s) in place.`,
  );
}

await main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
