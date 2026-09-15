import { describe, expect, it } from 'vitest';
import { CaseStage, type Prisma } from '../../prisma/client.js';
import { CLIENT_PHASES, type ClientPhase, clientPhaseOf, clientPhaseWhere } from './client-phase.js';

type Stages = CaseStage[];

/**
 * Evaluates the subset of `ClientWhereInput` that `clientPhaseWhere` builds
 * against a client's case stages — so the SQL filter and the in-memory ladder
 * can be proven to put every client in the same, single phase.
 */
function matches(where: Prisma.ClientWhereInput, stages: Stages): boolean {
  if (where.AND) return (where.AND as Prisma.ClientWhereInput[]).every((part) => matches(part, stages));
  if (where.OR) return where.OR.some((part) => matches(part, stages));

  const cases = (where.user as { cases: { some?: CaseFilter; none?: CaseFilter } }).cases;
  if (cases.some) return stages.some((stage) => caseMatches(cases.some!, stage));
  if (cases.none) return !stages.some((stage) => caseMatches(cases.none!, stage));
  throw new Error('unsupported filter');
}

type CaseFilter = { stage?: { in: CaseStage[] } };
const caseMatches = (filter: CaseFilter, stage: CaseStage) => !filter.stage || filter.stage.in.includes(stage);

const SCENARIOS: { name: string; stages: Stages; phase: ClientPhase }[] = [
  { name: 'registered with no case yet', stages: [], phase: 'PREPARING' },
  { name: 'contract drafted and left', stages: [CaseStage.CONTRACT_DRAFT], phase: 'PREPARING' },
  { name: 'contract signed, prepayment unpaid', stages: [CaseStage.CONTRACT_SIGNED], phase: 'PREPARING' },
  { name: 'prepayment in', stages: [CaseStage.PREPAYMENT_PAID], phase: 'ACTIVE' },
  { name: 'collecting documents', stages: [CaseStage.DOCUMENTS], phase: 'ACTIVE' },
  { name: 'about to fly', stages: [CaseStage.PRE_DEPARTURE], phase: 'ACTIVE' },
  { name: 'left for Korea', stages: [CaseStage.DEPARTED], phase: 'COMPLETED' },
  { name: 'marked completed', stages: [CaseStage.COMPLETED], phase: 'COMPLETED' },
  { name: 'paused', stages: [CaseStage.ON_HOLD], phase: 'ON_HOLD' },
  { name: 'cancelled', stages: [CaseStage.CANCELLED], phase: 'CANCELLED' },
  { name: 'refused', stages: [CaseStage.REJECTED, CaseStage.CANCELLED], phase: 'CANCELLED' },
  {
    name: 'a paid case outranks a fresh draft',
    stages: [CaseStage.CONTRACT_DRAFT, CaseStage.VISA],
    phase: 'ACTIVE',
  },
  {
    name: 'language-prep graduate back for a bachelor draft',
    stages: [CaseStage.CONTRACT_DRAFT, CaseStage.COMPLETED],
    phase: 'PREPARING',
  },
  { name: 'cancelled history, new draft', stages: [CaseStage.CANCELLED, CaseStage.CONTRACT_SIGNED], phase: 'PREPARING' },
  { name: 'paused outranks a draft', stages: [CaseStage.ON_HOLD, CaseStage.CONTRACT_DRAFT], phase: 'ON_HOLD' },
  { name: 'delivered outranks a cancellation', stages: [CaseStage.CANCELLED, CaseStage.DEPARTED], phase: 'COMPLETED' },
];

describe('client phase (1B-22)', () => {
  it.each(SCENARIOS)('$name → $phase', ({ stages, phase }) => {
    expect(clientPhaseOf(stages.map((stage) => ({ stage })))).toBe(phase);
  });

  it.each(SCENARIOS)('the database filter agrees, and matches exactly one phase: $name', ({ stages, phase }) => {
    const hits = CLIENT_PHASES.filter((candidate) => matches(clientPhaseWhere(candidate), stages));
    expect(hits).toEqual([phase]);
  });

  it('places every single stage in exactly one phase', () => {
    for (const stage of Object.values(CaseStage)) {
      const hits = CLIENT_PHASES.filter((candidate) => matches(clientPhaseWhere(candidate), [stage]));
      expect(hits, stage).toEqual([clientPhaseOf([{ stage }])]);
    }
  });
});
