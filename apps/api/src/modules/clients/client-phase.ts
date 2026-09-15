import { CaseStage, type Prisma } from '../../prisma/client.js';
import { PRE_PREPAYMENT_STAGES } from '../cases/case-flow.js';

/**
 * Where a client stands as a *business*, not as a row (1B-22).
 *
 * `Client.status` is an office flag that defaults to `ACTIVE` the moment a row
 * is created, so "Идэвхтэй" used to count everybody who ever had a contract
 * drafted and walked away. What the office means by the word is money: a client
 * is active once their prepayment is in and until they have left for Korea.
 * The answer therefore lives on their cases, and this file is the only place
 * that turns cases into a phase.
 *
 * A client may run several cases (§20), so the phase is the most committed one:
 * a paid case outranks a paused one, which outranks a draft, which outranks a
 * finished or cancelled history. Every client lands in exactly one phase — the
 * list filter, the header counters and the row badge all read the same ladder.
 */
export const CLIENT_PHASES = ['ACTIVE', 'ON_HOLD', 'PREPARING', 'COMPLETED', 'CANCELLED'] as const;
export type ClientPhase = (typeof CLIENT_PHASES)[number];

/** Prepayment confirmed and not yet gone — the office's "идэвхтэй". */
export const ACTIVE_STAGES: CaseStage[] = [
  CaseStage.PREPAYMENT_PAID,
  CaseStage.DOCUMENTS,
  CaseStage.APPLICATION_SUBMITTED,
  CaseStage.ADMITTED,
  CaseStage.TUITION_INVOICED,
  CaseStage.INVITATION_RECEIVED,
  CaseStage.GKS_ROUND1_PASSED,
  CaseStage.GKS_ROUND2_PASSED,
  CaseStage.VISA,
  CaseStage.VISA_APPROVED,
  CaseStage.BALANCE_PAID,
  CaseStage.COLLATERAL_CONTRACT,
  CaseStage.PRE_DEPARTURE,
];

/** A contract drafted or signed, the prepayment still owed. */
export const PREPARING_STAGES: CaseStage[] = [...PRE_PREPAYMENT_STAGES];

/** The service was delivered: the student has left, whether or not staff pressed "Дууссан". */
export const DELIVERED_STAGES: CaseStage[] = [CaseStage.DEPARTED, CaseStage.COMPLETED];

const ON_HOLD_STAGES: CaseStage[] = [CaseStage.ON_HOLD];

/** One rung of the ladder: the stages that earn it, in precedence order. */
const LADDER: { phase: Exclude<ClientPhase, 'CANCELLED'>; stages: CaseStage[] }[] = [
  { phase: 'ACTIVE', stages: ACTIVE_STAGES },
  { phase: 'ON_HOLD', stages: ON_HOLD_STAGES },
  { phase: 'PREPARING', stages: PREPARING_STAGES },
  { phase: 'COMPLETED', stages: DELIVERED_STAGES },
];

/**
 * The phase of one client from their cases, in memory — for a row already read.
 *
 * A client registered with no case yet has not signed anything either, so they
 * sit with the ones preparing a contract rather than in a phase of their own.
 */
export function clientPhaseOf(cases: { stage: CaseStage }[]): ClientPhase {
  if (cases.length === 0) return 'PREPARING';
  for (const rung of LADDER) {
    if (cases.some((row) => rung.stages.includes(row.stage))) return rung.phase;
  }
  return 'CANCELLED';
}

/**
 * The same ladder as a `Client` filter, so a count and a list agree with
 * {@link clientPhaseOf} without reading every case into memory.
 *
 * Each rung is "has a case at this rung, and none at any rung above it".
 */
export function clientPhaseWhere(phase: ClientPhase): Prisma.ClientWhereInput {
  const index = phase === 'CANCELLED' ? LADDER.length : LADDER.findIndex((rung) => rung.phase === phase);
  const above = LADDER.slice(0, index).flatMap((rung) => rung.stages);
  const none: Prisma.ClientWhereInput[] = above.length
    ? [{ user: { cases: { none: { stage: { in: above } } } } }]
    : [];

  if (phase === 'CANCELLED') {
    // Every case ended in cancellation or refusal — and there was at least one.
    return { AND: [...none, { user: { cases: { some: {} } } }] };
  }

  const own = LADDER[index]!.stages;
  const has: Prisma.ClientWhereInput =
    phase === 'PREPARING'
      ? { OR: [{ user: { cases: { some: { stage: { in: own } } } } }, { user: { cases: { none: {} } } }] }
      : { user: { cases: { some: { stage: { in: own } } } } };

  return { AND: [...none, has] };
}
