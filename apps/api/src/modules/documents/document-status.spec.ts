import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DocumentStatus } from '../../prisma/client.js';
import { assertTransition, canTransition, DOCUMENT_TRANSITIONS, isClientTransition } from './document-status.js';

/** The 12-state machine of gksedu.md §6.2 (1D-07). */
describe('document status machine', () => {
  it('covers all twelve states', () => {
    expect(Object.keys(DOCUMENT_TRANSITIONS)).toHaveLength(12);
  });

  it('walks the happy path from nothing to sent', () => {
    const path = [
      DocumentStatus.NOT_STARTED,
      DocumentStatus.IN_PROGRESS,
      DocumentStatus.SUBMITTED,
      DocumentStatus.UNDER_REVIEW,
      DocumentStatus.ACCEPTED,
      DocumentStatus.IN_TRANSLATION,
      DocumentStatus.TRANSLATED,
      DocumentStatus.CERTIFIED,
      DocumentStatus.READY,
      DocumentStatus.SENT_TO_UNIVERSITY,
    ];

    for (const [index, from] of path.slice(0, -1).entries()) {
      expect(canTransition(from, path[index + 1]!)).toBe(true);
    }
  });

  it('routes a rejected document back to a new submission', () => {
    expect(canTransition(DocumentStatus.UNDER_REVIEW, DocumentStatus.NEEDS_FIX)).toBe(true);
    expect(canTransition(DocumentStatus.NEEDS_FIX, DocumentStatus.RESUBMIT_REQUIRED)).toBe(true);
    expect(canTransition(DocumentStatus.RESUBMIT_REQUIRED, DocumentStatus.SUBMITTED)).toBe(true);
  });

  /**
   * 1N-21 — a school can ask again for a paper we already accepted, translated
   * or posted. The row has to go back on the client's list rather than stay
   * "Сургуульд илгээсэн" while the email asks for it.
   */
  it('lets a settled document be re-requested', () => {
    for (const settled of [
      DocumentStatus.ACCEPTED,
      DocumentStatus.IN_TRANSLATION,
      DocumentStatus.TRANSLATED,
      DocumentStatus.CERTIFIED,
      DocumentStatus.READY,
      DocumentStatus.SENT_TO_UNIVERSITY,
    ]) {
      expect(canTransition(settled, DocumentStatus.RESUBMIT_REQUIRED), settled).toBe(true);
    }
  });

  it('keeps re-requesting a staff move — a client cannot reopen their own sent document', () => {
    expect(isClientTransition(DocumentStatus.SENT_TO_UNIVERSITY, DocumentStatus.RESUBMIT_REQUIRED)).toBe(false);
  });

  it('refuses to skip review', () => {
    expect(() => assertTransition(DocumentStatus.SUBMITTED, DocumentStatus.ACCEPTED)).toThrow(BadRequestException);
    expect(canTransition(DocumentStatus.SENT_TO_UNIVERSITY, DocumentStatus.READY)).toBe(false);
  });

  it('lets a client only submit, never accept their own document', () => {
    expect(isClientTransition(DocumentStatus.NEEDS_FIX, DocumentStatus.SUBMITTED)).toBe(true);
    expect(isClientTransition(DocumentStatus.UNDER_REVIEW, DocumentStatus.ACCEPTED)).toBe(false);
  });
});
