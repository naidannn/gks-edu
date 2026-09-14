import { CaseStage } from '../../prisma/client.js';
import { CASE_FLOWS } from './case-flow.js';
import type { CaseSnapshot, CaseTab, NextAction } from './next-action.js';

/**
 * Which case tabs the portal shows this client, computed from the same
 * snapshot `nextAction` reads.
 *
 * The portal used to show all seven tabs from the first day of a case, so a
 * client who had just signed their contract was offered "Виз" and "Бэлтгэл" —
 * two screens that answer nothing for months and read as steps somebody forgot
 * to do. A tab appears when the case reaches the stage that opens it, and
 * never disappears again: everything already behind the client stays readable.
 *
 * It lives here rather than in the web app for the same reason `nextAction`
 * does — the stage graph is the authority on what has happened, and one place
 * must decide what that means.
 */

/** Canonical left-to-right order; the portal renders whatever survives in it. */
const TAB_ORDER: CaseTab[] = ['overview', 'contract', 'payment', 'documents', 'application', 'visa', 'departure'];

/**
 * The stage that opens each tab — the first of the listed stages that this
 * service's own journey contains.
 *
 * "Виз" has two entries because the two families reach it differently: the
 * regular flow starts visa work the moment the school's invitation lands, and
 * the GKS flow has no `INVITATION_RECEIVED` stage at all (`case-flow.ts`).
 * An empty list means the tab is open from the start.
 */
const TAB_OPENS_AT: Record<CaseTab, CaseStage[]> = {
  overview: [],
  contract: [],
  payment: [CaseStage.CONTRACT_SIGNED],
  documents: [CaseStage.PREPAYMENT_PAID],
  application: [CaseStage.APPLICATION_SUBMITTED],
  visa: [CaseStage.INVITATION_RECEIVED, CaseStage.VISA],
  departure: [CaseStage.PRE_DEPARTURE],
};

export function visibleCaseTabs(snapshot: CaseSnapshot, action: NextAction): CaseTab[] {
  const journey = CASE_FLOWS[snapshot.serviceType];
  const position = journey.indexOf(snapshot.stage);

  /** Work that already exists opens its own tab, wherever the stage stands. */
  const started: Partial<Record<CaseTab, boolean>> = {
    payment: snapshot.payments.length > 0,
    documents: snapshot.admissionDocs.requiredTotal > 0,
    visa: snapshot.visaDocs.requiredTotal > 0,
  };

  function reached(tab: CaseTab): boolean {
    const opensAt = TAB_OPENS_AT[tab];
    if (opensAt.length === 0) return true;
    // `ON_HOLD`, `CANCELLED` and `REJECTED` sit off the line, so nothing new
    // opens on them — what the case already has is what `started` says.
    if (position < 0) return false;
    const opens = opensAt.map((stage) => journey.indexOf(stage)).filter((index) => index >= 0);
    return opens.length > 0 && position >= Math.min(...opens);
  }

  // The next action is the one thing the portal always offers a way to reach;
  // a hidden tab under the "юу хийх ёстой вэ?" button would be a dead end.
  return TAB_ORDER.filter((tab) => tab === action.tab || reached(tab) || started[tab] === true);
}
