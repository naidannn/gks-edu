import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApplicationStatus } from '../../prisma/client.js';
import { APPLICATION_TRANSITIONS, assertApplicationTransition } from './application-status.js';

/** gksedu.md §7 — the 9 application states (1E-02). */
describe('application status machine', () => {
  it('covers all nine states', () => {
    expect(Object.keys(APPLICATION_TRANSITIONS)).toHaveLength(9);
  });

  it('walks preparation → submission → decision', () => {
    const path = [
      ApplicationStatus.PREPARING,
      ApplicationStatus.READY,
      ApplicationStatus.SUBMITTED,
      ApplicationStatus.UNDER_REVIEW,
      ApplicationStatus.ACCEPTED,
    ];
    for (const [index, from] of path.slice(0, -1).entries()) {
      expect(() => assertApplicationTransition(from, path[index + 1]!)).not.toThrow();
    }
  });

  it('sends an additional-docs request back into review', () => {
    expect(() =>
      assertApplicationTransition(ApplicationStatus.ADDITIONAL_DOCS_REQUESTED, ApplicationStatus.UNDER_REVIEW),
    ).not.toThrow();
  });

  it('refuses to submit before the paperwork stage is left', () => {
    expect(() => assertApplicationTransition(ApplicationStatus.PREPARING, ApplicationStatus.SUBMITTED)).toThrow(BadRequestException);
  });

  it('treats acceptance and rejection as final', () => {
    expect(APPLICATION_TRANSITIONS[ApplicationStatus.ACCEPTED]).toHaveLength(0);
    expect(APPLICATION_TRANSITIONS[ApplicationStatus.REJECTED]).toHaveLength(0);
  });
});
