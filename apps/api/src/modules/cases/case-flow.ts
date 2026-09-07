import { CaseStage, type Prisma, Role, ServiceType } from '../../prisma/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1C-04 — per-service stage graph, stored as `CaseFlowDefinition` rows (data,
// not a hardcoded map) because the regular-brokerage and GKS-scholarship
// families order BALANCE_PAID differently around the visa step (§9).
// ─────────────────────────────────────────────────────────────────────────────

export const REGULAR_BASE: CaseStage[] = [
  CaseStage.CONTRACT_DRAFT,
  CaseStage.CONTRACT_SIGNED,
  CaseStage.PREPAYMENT_PAID,
  CaseStage.DOCUMENTS,
  CaseStage.APPLICATION_SUBMITTED,
  CaseStage.ADMITTED,
  CaseStage.TUITION_INVOICED,
  CaseStage.INVITATION_RECEIVED,
  CaseStage.VISA,
  CaseStage.VISA_APPROVED,
  CaseStage.BALANCE_PAID,
];

export const TAIL = [CaseStage.PRE_DEPARTURE, CaseStage.DEPARTED, CaseStage.COMPLETED];

/** Case-stage sequence per service (ARCHITECTURE.md §5). */
export const CASE_FLOWS: Record<ServiceType, CaseStage[]> = {
  [ServiceType.LANGUAGE_PREP]: [...REGULAR_BASE, CaseStage.COLLATERAL_CONTRACT, ...TAIL],
  [ServiceType.BACHELOR]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.MASTER]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.PHD]: [...REGULAR_BASE, ...TAIL],
  [ServiceType.GKS_SCHOLARSHIP]: [
    CaseStage.CONTRACT_DRAFT,
    CaseStage.CONTRACT_SIGNED,
    CaseStage.PREPAYMENT_PAID,
    CaseStage.DOCUMENTS,
    CaseStage.APPLICATION_SUBMITTED,
    CaseStage.GKS_ROUND1_PASSED,
    CaseStage.GKS_ROUND2_PASSED,
    CaseStage.BALANCE_PAID,
    CaseStage.VISA,
    CaseStage.VISA_APPROVED,
    ...TAIL,
  ],
};

/** Only `PaymentsService.confirmPayment` / `ContractsService.sign` may make these — never a manual staff click. */
export const SYSTEM_ONLY_TARGETS = new Set<CaseStage>([CaseStage.CONTRACT_SIGNED, CaseStage.PREPAYMENT_PAID, CaseStage.BALANCE_PAID]);

/**
 * The stages a case passes through before its prepayment is confirmed.
 *
 * `PREPAYMENT_PAID` is a system-only target, so a case standing anywhere past
 * it has, by construction, a confirmed prepayment behind it — reading the stage
 * asks the same question as counting `PAID` payment rows, and cannot disagree
 * with the stage graph the rest of the flow runs on (gksedu.md §9).
 */
export const PRE_PREPAYMENT_STAGES = new Set<CaseStage>([CaseStage.CONTRACT_DRAFT, CaseStage.CONTRACT_SIGNED]);
export const ESCAPE_STAGES = [CaseStage.ON_HOLD, CaseStage.CANCELLED, CaseStage.REJECTED];
const FLOW_STAFF_ROLES = [Role.ADMIN, Role.CONSULTANT];

export function buildCaseFlowDefinitions(): Prisma.CaseFlowDefinitionCreateManyInput[] {
  const rows: Prisma.CaseFlowDefinitionCreateManyInput[] = [];

  for (const [serviceType, stages] of Object.entries(CASE_FLOWS) as [ServiceType, CaseStage[]][]) {
    stages.forEach((fromStage, index) => {
      const toStage = stages[index + 1];
      const isLastStage = index === stages.length - 1;

      if (toStage) {
        const isSystemOnly = SYSTEM_ONLY_TARGETS.has(toStage);
        rows.push({
          serviceType,
          fromStage,
          toStage,
          allowedRoles: isSystemOnly ? [] : FLOW_STAFF_ROLES,
          isSystemOnly,
          sortOrder: index,
        });
      }

      if (!isLastStage) {
        for (const escape of ESCAPE_STAGES) {
          rows.push({ serviceType, fromStage, toStage: escape, allowedRoles: FLOW_STAFF_ROLES, isSystemOnly: false, sortOrder: 900 });
        }
      }
    });

    // A staff member decides where a paused case resumes.
    for (const stage of stages) {
      rows.push({
        serviceType,
        fromStage: CaseStage.ON_HOLD,
        toStage: stage,
        allowedRoles: FLOW_STAFF_ROLES,
        isSystemOnly: false,
        sortOrder: 901,
      });
    }
  }

  return rows;
}
