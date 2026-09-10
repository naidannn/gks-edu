import { describe, expect, it } from 'vitest';
import { CaseStage, ServiceType } from '../../prisma/client.js';
import { CASE_FLOWS, SYSTEM_ONLY_TARGETS, buildCaseFlowDefinitions, mainLineForward } from './case-flow.js';

const rows = buildCaseFlowDefinitions();
const resumeEdges = rows.filter((row) => row.fromStage === CaseStage.ON_HOLD);

describe('buildCaseFlowDefinitions — where a paused case may resume (1N-06)', () => {
  it('seeds no resume edge into a stage only a payment or a signature can reach', () => {
    // Otherwise a consultant parks a CONTRACT_DRAFT case and brings it back at
    // BALANCE_PAID: no contract, no money, and every "past PREPAYMENT_PAID means
    // the prepayment is in" reading downstream of it becomes false.
    const systemTargets = resumeEdges.filter((row) => SYSTEM_ONLY_TARGETS.has(row.toStage));
    expect(systemTargets).toEqual([]);
  });

  it('seeds no resume edge that finishes the case outright', () => {
    expect(resumeEdges.some((row) => row.toStage === CaseStage.COMPLETED)).toBe(false);
  });

  it('still lets staff resume into the ordinary working stages', () => {
    const languagePrep = resumeEdges
      .filter((row) => row.serviceType === ServiceType.LANGUAGE_PREP)
      .map((row) => row.toStage);

    expect(languagePrep).toContain(CaseStage.CONTRACT_DRAFT);
    expect(languagePrep).toContain(CaseStage.DOCUMENTS);
    expect(languagePrep).toContain(CaseStage.VISA);
  });
});

describe('mainLineForward (1N-27)', () => {
  it('lists the hops between a stage and one ahead of it', () => {
    expect(mainLineForward(ServiceType.BACHELOR, CaseStage.ADMITTED, CaseStage.VISA_APPROVED)).toEqual([
      CaseStage.TUITION_INVOICED,
      CaseStage.INVITATION_RECEIVED,
      CaseStage.VISA,
      CaseStage.VISA_APPROVED,
    ]);
  });

  it('knows the two families order BALANCE_PAID differently around the visa (§9)', () => {
    // Regular brokerage bills after the visa; a GKS case after the result.
    expect(CASE_FLOWS[ServiceType.GKS_SCHOLARSHIP].indexOf(CaseStage.BALANCE_PAID)).toBeLessThan(
      CASE_FLOWS[ServiceType.GKS_SCHOLARSHIP].indexOf(CaseStage.VISA),
    );
    expect(mainLineForward(ServiceType.GKS_SCHOLARSHIP, CaseStage.GKS_ROUND2_PASSED, CaseStage.VISA)).toEqual([
      CaseStage.BALANCE_PAID,
      CaseStage.VISA,
    ]);
  });

  it('answers null for a backwards move, an escape stage and a stage off this service`s line', () => {
    expect(mainLineForward(ServiceType.BACHELOR, CaseStage.VISA_APPROVED, CaseStage.ADMITTED)).toBeNull();
    expect(mainLineForward(ServiceType.BACHELOR, CaseStage.ADMITTED, CaseStage.REJECTED)).toBeNull();
    expect(mainLineForward(ServiceType.BACHELOR, CaseStage.ADMITTED, CaseStage.GKS_ROUND1_PASSED)).toBeNull();
  });
});
