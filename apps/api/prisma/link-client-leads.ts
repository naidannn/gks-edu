/**
 * Links every client to the enquiries they came from (1B-26).
 *
 *   pnpm clients:link-leads          # link and fold
 *   pnpm clients:link-leads --dry    # print what would change, write nothing
 *
 * Until 1B-26 only the lead's "convert" button linked a client to a lead; the
 * client form and the cabinet did not. On 2026-10-12 production had 67 clients,
 * 4 linked, and 28 more with a lead under the same number — so the source
 * report showed one website enquiry won out of 202.
 *
 * For each client, oldest first, the same rule the app now applies on
 * registration: leads with the same number and a given name that agrees. A
 * client with no lead gets the oldest one (moved to WON, dated the day the
 * client was registered, so the win lands in the right month) and is
 * attributed to its source; any further matches fold into it as duplicates.
 * Re-running is safe — a linked or folded lead never matches again.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { attachLeadsToClient, findLeadsOfPerson, foldLeads } from '../src/modules/clients/link-leads.js';

loadEnv({ path: ['.env', '../../.env'], quiet: true });

const dryRun = process.argv.slice(2).includes('--dry');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main(): Promise<void> {
  const clients = await prisma.client.findMany({
    select: {
      id: true,
      code: true,
      userId: true,
      leadId: true,
      firstName: true,
      phone: true,
      phoneAlt: true,
      source: true,
      assignedConsultantId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  let linked = 0;
  let folded = 0;

  for (const client of clients) {
    const matches = (await findLeadsOfPerson(prisma, client)).filter((lead) => lead.id !== client.leadId);
    if (!matches.length) continue;

    if (client.leadId) {
      console.log(`${client.code}: ${matches.length} давхар сэжим → холбогдсон сэжимд нэгтгэнэ`);
      folded += matches.length;
      if (!dryRun) {
        await prisma.$transaction((tx) => foldLeads(tx, client.leadId!, matches.map((lead) => lead.id), null));
      }
      continue;
    }

    const [primary, ...rest] = matches;
    const source = primary!.source === client.source ? '' : `, эх сурвалж ${client.source} → ${primary!.source}`;
    console.log(
      `${client.code}: сэжим ${primary!.source}/${primary!.stage} (${primary!.createdAt.toISOString().slice(0, 10)}) холбоно` +
        `${rest.length ? `, ${rest.length} давхрыг нэгтгэнэ` : ''}${source}`,
    );
    linked += 1;
    folded += rest.length;
    if (dryRun) continue;

    await prisma.$transaction(async (tx) => {
      const lead = await attachLeadsToClient(tx, client, matches, { actorId: null, occurredAt: client.createdAt });
      if (lead) await tx.client.update({ where: { id: client.id }, data: { source: lead.source } });
    });
  }

  console.log(
    `\n${dryRun ? '[dry] ' : ''}${clients.length} үйлчлүүлэгч: ${linked} нь сэжимтэй холбогдлоо, ${folded} давхар сэжим нэгтгэгдлээ.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
