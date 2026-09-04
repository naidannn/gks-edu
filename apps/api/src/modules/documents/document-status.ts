import { BadRequestException } from '@nestjs/common';
import { DocumentStatus } from '../../prisma/client.js';

/**
 * The 12-state material machine (gksedu.md §6.2, ARCHITECTURE.md §7.2).
 *
 * Kept as a plain map rather than `CaseFlowDefinition`-style rows because —
 * unlike the case stage graph — every service walks this identical path; the
 * only branch is whether a document needs a translation, and that is a property
 * of the template, checked at `ACCEPTED`.
 */
export const DOCUMENT_TRANSITIONS: Record<DocumentStatus, readonly DocumentStatus[]> = {
  [DocumentStatus.NOT_STARTED]: [DocumentStatus.IN_PROGRESS, DocumentStatus.SUBMITTED],
  [DocumentStatus.IN_PROGRESS]: [DocumentStatus.SUBMITTED],
  [DocumentStatus.SUBMITTED]: [DocumentStatus.UNDER_REVIEW],
  [DocumentStatus.UNDER_REVIEW]: [DocumentStatus.NEEDS_FIX, DocumentStatus.ACCEPTED],
  // The client may simply re-upload; `RESUBMIT_REQUIRED` is the formal ask.
  [DocumentStatus.NEEDS_FIX]: [DocumentStatus.RESUBMIT_REQUIRED, DocumentStatus.SUBMITTED],
  [DocumentStatus.RESUBMIT_REQUIRED]: [DocumentStatus.SUBMITTED],
  // Straight to READY when the template needs no translation.
  [DocumentStatus.ACCEPTED]: [DocumentStatus.IN_TRANSLATION, DocumentStatus.READY],
  [DocumentStatus.IN_TRANSLATION]: [DocumentStatus.TRANSLATED],
  [DocumentStatus.TRANSLATED]: [DocumentStatus.CERTIFIED, DocumentStatus.READY],
  [DocumentStatus.CERTIFIED]: [DocumentStatus.READY],
  [DocumentStatus.READY]: [DocumentStatus.SENT_TO_UNIVERSITY],
  [DocumentStatus.SENT_TO_UNIVERSITY]: [],
};

/** Moves a client may make on their own document; everything else is staff work. */
export const CLIENT_TRANSITIONS: readonly `${DocumentStatus}->${DocumentStatus}`[] = [
  `${DocumentStatus.NOT_STARTED}->${DocumentStatus.IN_PROGRESS}`,
  `${DocumentStatus.NOT_STARTED}->${DocumentStatus.SUBMITTED}`,
  `${DocumentStatus.IN_PROGRESS}->${DocumentStatus.SUBMITTED}`,
  `${DocumentStatus.NEEDS_FIX}->${DocumentStatus.SUBMITTED}`,
  `${DocumentStatus.RESUBMIT_REQUIRED}->${DocumentStatus.SUBMITTED}`,
];

/** A document that counts as collected for progress and for the application gate (1E-03). */
export const SETTLED_STATUSES: readonly DocumentStatus[] = [
  DocumentStatus.ACCEPTED,
  DocumentStatus.IN_TRANSLATION,
  DocumentStatus.TRANSLATED,
  DocumentStatus.CERTIFIED,
  DocumentStatus.READY,
  DocumentStatus.SENT_TO_UNIVERSITY,
];

/** Fully finished — nothing left for staff to do on it. */
export const FINISHED_STATUSES: readonly DocumentStatus[] = [DocumentStatus.READY, DocumentStatus.SENT_TO_UNIVERSITY];

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return DOCUMENT_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: DocumentStatus, to: DocumentStatus): void {
  if (!canTransition(from, to)) {
    throw new BadRequestException(`Материалыг ${from} төлөвөөс ${to} рүү шилжүүлэх боломжгүй`);
  }
}

export function isClientTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return (CLIENT_TRANSITIONS as readonly string[]).includes(`${from}->${to}`);
}
