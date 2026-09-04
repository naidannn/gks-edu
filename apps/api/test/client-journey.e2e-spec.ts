import { describe, expect, it } from 'vitest';
import { buildCaseFlowDefinitions, CASE_FLOWS } from '../src/modules/cases/case-flow.js';
import {
  CaseStage,
  DocumentStatus,
  LeadStage,
  NotificationEvent,
  Role,
  ServiceType,
  VisaStatus,
} from '../src/prisma/client.js';
import { LEAD_STAGE_TRANSITIONS } from '../src/modules/leads/leads.service.js';
import { canTransition, SETTLED_STATUSES } from '../src/modules/documents/document-status.js';
import { VISA_TRANSITIONS } from '../src/modules/visa/visa-status.js';
import { NOTIFICATION_TEMPLATES } from '../src/modules/notifications/notification-templates.data.js';

/**
 * 1G-16 — one client's whole journey, зөвлөгөөнөөс явах хүртэл.
 *
 * This walks the state machines the way the modules actually walk them and
 * asserts the path is connected end to end: a broken edge anywhere between
 * "зөвлөгөө хүслээ" and "Солонгос руу явлаа" fails here rather than in
 * production on a real client's case.
 *
 * It is deliberately database-free — the four graphs under test are pure data,
 * so this runs in CI with no Postgres. A live HTTP walk against a seeded
 * database belongs with the staging environment (0-15).
 */

/** Every edge the seeded `CaseFlowDefinition` rows allow, as `from->to`. */
const CASE_EDGES = new Set(
  buildCaseFlowDefinitions().map((row) => `${row.serviceType}:${row.fromStage}->${row.toStage}`),
);

function walkCase(serviceType: ServiceType, path: CaseStage[]): void {
  for (const [index, from] of path.entries()) {
    const to = path[index + 1];
    if (!to) return;
    expect(
      CASE_EDGES.has(`${serviceType}:${from}->${to}`),
      `${serviceType}: ${from} → ${to} is not an allowed case transition`,
    ).toBe(true);
  }
}

describe('1G-16 — зөвлөгөөнөөс явах хүртэл (regular brokerage)', () => {
  const SERVICE = ServiceType.BACHELOR;

  it('walks the sales funnel from the website enquiry to a signed deal', () => {
    const funnel: LeadStage[] = [
      LeadStage.NEW,
      LeadStage.CONTACTED,
      LeadStage.CONSULTED,
      LeadStage.PROPOSAL_SENT,
      LeadStage.CONTRACT_PENDING,
      LeadStage.WON,
    ];

    for (const [index, from] of funnel.entries()) {
      const to = funnel[index + 1];
      if (!to) break;
      expect(LEAD_STAGE_TRANSITIONS[from], `${from} → ${to}`).toContain(to);
    }
  });

  it('walks the case from contract draft to departure without a gap', () => {
    walkCase(SERVICE, [
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
      CaseStage.PRE_DEPARTURE,
      CaseStage.DEPARTED,
      CaseStage.COMPLETED,
    ]);
  });

  it('takes one document from "not started" to "sent to the university"', () => {
    const life: DocumentStatus[] = [
      DocumentStatus.NOT_STARTED,
      DocumentStatus.IN_PROGRESS,
      DocumentStatus.SUBMITTED,
      DocumentStatus.UNDER_REVIEW,
      // The realistic path includes one rejection and one re-submission.
      DocumentStatus.NEEDS_FIX,
      DocumentStatus.SUBMITTED,
      DocumentStatus.UNDER_REVIEW,
      DocumentStatus.ACCEPTED,
      DocumentStatus.IN_TRANSLATION,
      DocumentStatus.TRANSLATED,
      DocumentStatus.CERTIFIED,
      DocumentStatus.READY,
      DocumentStatus.SENT_TO_UNIVERSITY,
    ];

    for (const [index, from] of life.entries()) {
      const to = life[index + 1];
      if (!to) break;
      expect(canTransition(from, to), `${from} → ${to}`).toBe(true);
    }

    expect(SETTLED_STATUSES).toContain(DocumentStatus.SENT_TO_UNIVERSITY);
  });

  it('takes the visa from collecting to approved', () => {
    const visa: VisaStatus[] = [
      VisaStatus.COLLECTING,
      VisaStatus.REVIEWING,
      VisaStatus.READY,
      VisaStatus.SUBMITTED,
      VisaStatus.APPROVED,
    ];

    for (const [index, from] of visa.entries()) {
      const to = visa[index + 1];
      if (!to) break;
      expect(VISA_TRANSITIONS[from], `${from} → ${to}`).toContain(to);
    }
  });

  it('has a notification template for every milestone the journey passes', () => {
    const milestones: NotificationEvent[] = [
      NotificationEvent.LEAD_CREATED,
      NotificationEvent.CONTRACT_CONFIRMED,
      NotificationEvent.PAYMENT_CONFIRMED,
      NotificationEvent.DOCUMENT_DEADLINE_NEAR,
      NotificationEvent.DOCUMENT_REJECTED,
      NotificationEvent.APPLICATION_RESULT,
      NotificationEvent.INVITATION_RECEIVED,
      NotificationEvent.VISA_STAGE_STARTED,
      NotificationEvent.VISA_RESULT,
      NotificationEvent.DEPARTURE_NEAR,
    ];

    const events = new Set(NOTIFICATION_TEMPLATES.map((template) => template.event));
    for (const event of milestones) {
      expect(events.has(event), `${event} has no template`).toBe(true);
    }
  });
});

describe('1G-16 — GKS scholarship variant (§9: balance before the visa)', () => {
  const SERVICE = ServiceType.GKS_SCHOLARSHIP;

  it('passes both decision rounds and pays the balance before the visa opens', () => {
    walkCase(SERVICE, [
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
      CaseStage.PRE_DEPARTURE,
      CaseStage.DEPARTED,
      CaseStage.COMPLETED,
    ]);
  });

  it('orders the balance differently from the regular flow — the §9 rule, not a constant', () => {
    const gks = CASE_FLOWS[ServiceType.GKS_SCHOLARSHIP];
    const regular = CASE_FLOWS[ServiceType.BACHELOR];

    expect(gks.indexOf(CaseStage.BALANCE_PAID)).toBeLessThan(gks.indexOf(CaseStage.VISA));
    expect(regular.indexOf(CaseStage.BALANCE_PAID)).toBeGreaterThan(regular.indexOf(CaseStage.VISA_APPROVED));
  });
});

describe('1G-16 — the paths that must NOT exist', () => {
  it('refuses to skip the prepayment', () => {
    expect(CASE_EDGES.has(`${ServiceType.BACHELOR}:${CaseStage.CONTRACT_SIGNED}->${CaseStage.DOCUMENTS}`)).toBe(false);
  });

  it('refuses to accept a document nobody reviewed', () => {
    expect(canTransition(DocumentStatus.SUBMITTED, DocumentStatus.ACCEPTED)).toBe(false);
  });

  it('leaves the money stages to the system, never to a staff click', () => {
    const systemEdges = buildCaseFlowDefinitions().filter((row) => row.isSystemOnly);
    for (const edge of systemEdges) {
      expect(edge.allowedRoles, `${edge.fromStage}->${edge.toStage}`).toEqual([]);
    }
    expect(systemEdges.some((edge) => edge.toStage === CaseStage.PREPAYMENT_PAID)).toBe(true);
  });

  it('lets a case be put on hold from anywhere but the final stage', () => {
    const flow = CASE_FLOWS[ServiceType.BACHELOR];
    for (const stage of flow.slice(0, -1)) {
      expect(
        CASE_EDGES.has(`${ServiceType.BACHELOR}:${stage}->${CaseStage.ON_HOLD}`),
        `${stage} cannot be put on hold`,
      ).toBe(true);
    }
  });

  it('keeps the escape hatches out of ADMIN-only hands — any staff may pause a case', () => {
    const holds = buildCaseFlowDefinitions().filter((row) => row.toStage === CaseStage.ON_HOLD);
    expect(holds.length).toBeGreaterThan(0);
    for (const row of holds) expect(row.allowedRoles).toContain(Role.CONSULTANT);
  });
});
