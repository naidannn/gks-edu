import { describe, expect, it } from 'vitest';
import { BalanceTrigger, CaseStage, ContractStatus, ContractType, PaymentKind, PaymentStatus, ServiceType } from '../../prisma/client.js';
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

function contract(overrides: Partial<NonNullable<CaseSnapshot['contract']>> = {}): CaseSnapshot['contract'] {
  return {
    type: ContractType.ELECTRONIC,
    status: ContractStatus.SENT,
    acceptedAt: null,
    otpVerifiedAt: null,
    balanceTriggerSnapshot: BalanceTrigger.AFTER_VISA_APPROVED,
    ...overrides,
  };
}

describe('nextAction', () => {
  it('asks the client to read and accept an unopened electronic contract', () => {
    const action = nextAction(snapshot({ contract: contract() }));
    expect(action.key).toBe('CONTRACT_ACCEPT');
    expect(action.actor).toBe('CLIENT');
    expect(action.tab).toBe('contract');
  });

  it('asks for the OTP once the terms are accepted', () => {
    const action = nextAction(snapshot({ contract: contract({ acceptedAt: new Date() }) }));
    expect(action.key).toBe('CONTRACT_OTP');
  });

  it('leaves a physical contract with the office', () => {
    const action = nextAction(snapshot({ contract: contract({ type: ContractType.PHYSICAL }) }));
    expect(action.actor).toBe('STAFF');
  });

  it('points a signed case at the prepayment, and at QPay once an invoice exists', () => {
    const signed = snapshot({ stage: CaseStage.CONTRACT_SIGNED, contract: contract({ status: ContractStatus.SIGNED }) });
    expect(nextAction(signed).key).toBe(PaymentKind.PREPAYMENT);

    const invoiced = nextAction({
      ...signed,
      payments: [{ kind: PaymentKind.PREPAYMENT, status: PaymentStatus.PENDING }],
    });
    expect(invoiced.key).toBe('PREPAYMENT_PENDING');
    expect(invoiced.tab).toBe('payment');
  });

  it('walks the paperwork: questionnaire, uploads, fixes, then the review', () => {
    const base = snapshot({ stage: CaseStage.DOCUMENTS });
    expect(nextAction(base).key).toBe('CONDITIONS');

    expect(nextAction({ ...base, admissionDocs: { ...EMPTY_PROGRESS, requiredTotal: 6, requiredDone: 2 } }).key)
      .toBe('DOC_UPLOAD');

    // A fix outranks the remaining uploads — it is the one thing that blocks.
    expect(nextAction({ ...base, admissionDocs: { requiredTotal: 6, requiredDone: 2, awaitingReview: 1, needsFix: 1 } }).key)
      .toBe('DOC_FIX');

    expect(nextAction({ ...base, admissionDocs: { requiredTotal: 6, requiredDone: 6, awaitingReview: 2, needsFix: 0 } }).key)
      .toBe('DOC_REVIEW');

    expect(nextAction({ ...base, admissionDocs: { requiredTotal: 6, requiredDone: 6, awaitingReview: 0, needsFix: 0 } }).key)
      .toBe('APPLICATION_READY');
  });

  it('only bills the balance after the visa when the contract says so (§9)', () => {
    const approved = snapshot({ stage: CaseStage.VISA_APPROVED, contract: contract({ status: ContractStatus.SIGNED }) });
    expect(nextAction(approved).key).toBe(PaymentKind.BALANCE);

    const gks = nextAction({
      ...approved,
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      contract: contract({ status: ContractStatus.SIGNED, balanceTriggerSnapshot: BalanceTrigger.AFTER_SCHOLARSHIP_RESULT }),
    });
    expect(gks.actor).toBe('STAFF');
  });

  it('bills the GKS balance on the scholarship result instead', () => {
    const action = nextAction(snapshot({
      serviceType: ServiceType.GKS_SCHOLARSHIP,
      stage: CaseStage.GKS_ROUND2_PASSED,
      contract: contract({ status: ContractStatus.SIGNED, balanceTriggerSnapshot: BalanceTrigger.AFTER_SCHOLARSHIP_RESULT }),
    }));
    expect(action.key).toBe(PaymentKind.BALANCE);
  });

  it('sends a language-prep case to the collateral contract after the balance (§5.4)', () => {
    const languagePrep = nextAction(snapshot({ serviceType: ServiceType.LANGUAGE_PREP, stage: CaseStage.BALANCE_PAID }));
    expect(languagePrep.key).toBe('COLLATERAL_CONTRACT');

    const bachelor = nextAction(snapshot({ stage: CaseStage.BALANCE_PAID }));
    expect(bachelor.key).toBe('STAFF_REVIEW');
  });

  it('never offers the client a button on a cancelled case', () => {
    const action = nextAction(snapshot({ stage: CaseStage.CANCELLED }));
    expect(action.actor).toBe('NONE');
  });
});

