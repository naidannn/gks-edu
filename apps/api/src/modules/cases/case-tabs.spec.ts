import { describe, expect, it } from 'vitest';
import { CaseStage, PaymentKind, PaymentStatus, ServiceType } from '../../prisma/client.js';
import { visibleCaseTabs } from './case-tabs.js';
import { type CaseSnapshot, nextAction } from './next-action.js';

const EMPTY_PROGRESS = { requiredTotal: 0, requiredDone: 0, awaitingReview: 0, needsFix: 0 };

function snapshot(overrides: Partial<CaseSnapshot> = {}): CaseSnapshot {
  return {
    serviceType: ServiceType.BACHELOR,
    stage: CaseStage.CONTRACT_DRAFT,
    contract: null,
    payments: [],
    admissionDocs: { ...EMPTY_PROGRESS },
    visaDocs: { ...EMPTY_PROGRESS },
    ...overrides,
  };
}

/** The portal reads both off one snapshot, so the tests do too. */
function tabs(overrides: Partial<CaseSnapshot> = {}) {
  const row = snapshot(overrides);
  return visibleCaseTabs(row, nextAction(row));
}

describe('visibleCaseTabs', () => {
  it('offers a fresh case its contract and nothing beyond it', () => {
    expect(tabs()).toEqual(['overview', 'contract']);
  });

  it('opens the payment tab once the contract is signed', () => {
    expect(tabs({ stage: CaseStage.CONTRACT_SIGNED })).toEqual(['overview', 'contract', 'payment']);
  });

  it('opens the material checklist once the prepayment is confirmed', () => {
    expect(tabs({ stage: CaseStage.PREPAYMENT_PAID })).toContain('documents');
    expect(tabs({ stage: CaseStage.PREPAYMENT_PAID })).not.toContain('visa');
  });

  it('keeps the visa and departure tabs away until the journey reaches them', () => {
    const collecting = tabs({ stage: CaseStage.DOCUMENTS, admissionDocs: { ...EMPTY_PROGRESS, requiredTotal: 4 } });
    expect(collecting).not.toContain('visa');
    expect(collecting).not.toContain('departure');

    expect(tabs({ stage: CaseStage.INVITATION_RECEIVED })).toContain('visa');
    expect(tabs({ stage: CaseStage.PRE_DEPARTURE })).toContain('departure');
  });

  it('opens the GKS visa tab at VISA, a flow with no invitation stage', () => {
    const gks = { serviceType: ServiceType.GKS_SCHOLARSHIP } as const;
    expect(tabs({ ...gks, stage: CaseStage.GKS_ROUND2_PASSED })).not.toContain('visa');
    expect(tabs({ ...gks, stage: CaseStage.VISA })).toContain('visa');
  });

  it('always offers the tab the next action points at', () => {
    // Everything collected while the case still stands at DOCUMENTS: the next
    // step lives on "Мэдүүлэг", which the stage alone would still be hiding.
    const ready = { requiredTotal: 3, requiredDone: 3, awaitingReview: 0, needsFix: 0 };
    const row = snapshot({ stage: CaseStage.DOCUMENTS, admissionDocs: ready });
    expect(nextAction(row).tab).toBe('application');
    expect(visibleCaseTabs(row, nextAction(row))).toContain('application');
  });

  it('keeps what a paused case already had, and opens nothing new', () => {
    const held = tabs({
      stage: CaseStage.ON_HOLD,
      payments: [{ kind: PaymentKind.PREPAYMENT, status: PaymentStatus.PAID }],
      admissionDocs: { ...EMPTY_PROGRESS, requiredTotal: 6 },
    });
    expect(held).toEqual(['overview', 'contract', 'payment', 'documents']);
  });
});
