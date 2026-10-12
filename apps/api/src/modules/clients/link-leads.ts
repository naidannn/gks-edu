import { LeadActivityType, LeadStage, Prisma, type LeadSource } from '../../prisma/client.js';
import type { PrismaClient } from '../../prisma/client.js';
import { phoneKey, sameGivenName } from '../leads/person-match.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface PersonLead {
  id: string;
  firstName: string;
  stage: LeadStage;
  assignedToId: string | null;
  source: LeadSource;
  createdAt: Date;
}

/**
 * The leads that are this person and that nobody has acted on as such yet:
 * same number (main or alternate), a given name that agrees (see
 * `person-match.ts`), not folded into another lead, not already a client's.
 * Oldest first — the first touch is the one a client is attributed to.
 */
export async function findLeadsOfPerson(
  db: Db,
  person: { phone: string; phoneAlt?: string | null; firstName: string },
): Promise<PersonLead[]> {
  const keys = [...new Set([phoneKey(person.phone), phoneKey(person.phoneAlt)].filter((key): key is string => !!key))];
  if (!keys.length) return [];

  const leads = await db.lead.findMany({
    where: {
      mergedIntoId: null,
      client: { is: null },
      OR: keys.map((key) => ({ phone: { endsWith: key } })),
    },
    select: { id: true, firstName: true, stage: true, assignedToId: true, source: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  return leads.filter((lead) => sameGivenName(lead.firstName, person.firstName));
}

/**
 * Hangs a client on the enquiry it came from (1B-26).
 *
 * The office mostly registers clients from the client form, not with the
 * lead's "convert" button, and the cabinet's self-service form never knew
 * about leads at all — so 63 of 67 clients had no lead, and the sales report
 * showed one website enquiry won out of 202. Whichever way a client is
 * created, this runs: the oldest matching lead becomes theirs and moves to
 * `WON` with the same trail entry a conversion writes (the report counts
 * that entry, in the month it is dated); any further leads of the same
 * person fold into it as duplicates.
 *
 * Returns the linked lead, so the caller can attribute the client to it.
 */
export async function attachLeadsToClient(
  tx: Prisma.TransactionClient,
  client: { id: string; code: string; userId: string; assignedConsultantId: string | null },
  leads: PersonLead[],
  options: { actorId: string | null; occurredAt?: Date },
): Promise<PersonLead | null> {
  const [primary, ...rest] = leads;
  if (!primary) return null;

  await tx.client.update({
    where: { id: client.id },
    data: {
      leadId: primary.id,
      // The consultant who worked the enquiry keeps the person, unless the
      // registration already named someone.
      ...(!client.assignedConsultantId && primary.assignedToId ? { assignedConsultantId: primary.assignedToId } : {}),
    },
  });
  await tx.lead.update({ where: { id: primary.id }, data: { userId: client.userId, stage: LeadStage.WON } });
  await tx.leadActivity.create({
    data: {
      leadId: primary.id,
      type: primary.stage === LeadStage.WON ? LeadActivityType.NOTE : LeadActivityType.STAGE_CHANGE,
      body: `Үйлчлүүлэгчтэй холбогдлоо (${client.code})`,
      meta: { from: primary.stage, to: LeadStage.WON, clientId: client.id, linked: true } satisfies Prisma.InputJsonObject,
      actorId: options.actorId,
      ...(options.occurredAt ? { occurredAt: options.occurredAt } : {}),
    },
  });

  await foldLeads(tx, primary.id, rest.map((lead) => lead.id), options.actorId);

  // The person's Messenger threads now know who they are talking to.
  await tx.facebookThread.updateMany({
    where: { leadId: primary.id, clientId: null },
    data: { clientId: client.id },
  });

  return primary;
}

/**
 * Folds duplicate leads into `targetId` the way the merge tool does (1B-09):
 * the timeline moves, the duplicates stay as history marked `LOST`, and the
 * chats that pointed at them point at the survivor.
 */
export async function foldLeads(
  tx: Prisma.TransactionClient,
  targetId: string,
  sourceIds: string[],
  actorId: string | null,
): Promise<void> {
  if (!sourceIds.length) return;

  await tx.leadActivity.updateMany({ where: { leadId: { in: sourceIds } }, data: { leadId: targetId } });
  await tx.chatSession.updateMany({ where: { leadId: { in: sourceIds } }, data: { leadId: targetId } });
  await tx.facebookThread.updateMany({ where: { leadId: { in: sourceIds } }, data: { leadId: targetId } });
  await tx.lead.updateMany({
    where: { id: { in: sourceIds } },
    data: { mergedIntoId: targetId, mergedAt: new Date(), stage: LeadStage.LOST, lostReason: 'Давхардсан — нэгтгэсэн' },
  });
  await tx.leadActivity.create({
    data: {
      leadId: targetId,
      type: LeadActivityType.NOTE,
      body: `Ижил утас, нэртэй ${sourceIds.length} давхар сэжмийг нэгтгэлээ`,
      meta: { mergedFromIds: sourceIds } satisfies Prisma.InputJsonObject,
      actorId,
    },
  });
}
