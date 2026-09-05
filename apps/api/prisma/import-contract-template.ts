/**
 * Publishes the contract body shipped in
 * `src/modules/contracts/contract-body.template.ts` as a new active version for
 * every service.
 *
 *   pnpm contract:template:import        # publish it
 *   pnpm contract:template:import --dry  # report what would change, write nothing
 *
 * The seed only creates a template when a service has none, so an office that
 * has been running for a while never picks up a new wording by re-seeding.
 * This is the deliberate step that replaces it: the current template is kept,
 * deactivated, as the previous version — contracts already issued are
 * unaffected, since each one stores its own rendered body.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient, ServiceType } from '../src/generated/prisma/client.js';
import { CONTRACT_BODY_TEMPLATE } from '../src/modules/contracts/contract-body.template.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  for (const serviceType of Object.values(ServiceType)) {
    const current = await prisma.contractTemplate.findFirst({ where: { serviceType, isActive: true } });

    if (current?.bodyMn === CONTRACT_BODY_TEMPLATE) {
      console.log(`${serviceType.padEnd(16)} v${current.version} — аль хэдийн шинэ загвартай`);
      continue;
    }

    const version = (current?.version ?? 0) + 1;
    if (dryRun) {
      console.log(`${serviceType.padEnd(16)} v${current?.version ?? '—'} → v${version} (dry run)`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (current) await tx.contractTemplate.update({ where: { id: current.id }, data: { isActive: false } });
      await tx.contractTemplate.create({
        data: { serviceType, version, isActive: true, bodyMn: CONTRACT_BODY_TEMPLATE },
      });
    });
    console.log(`${serviceType.padEnd(16)} v${current?.version ?? '—'} → v${version}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
