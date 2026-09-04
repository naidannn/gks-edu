import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { VisaStatus } from '../../prisma/client.js';
import { assertVisaTransition, VISA_TRANSITIONS } from './visa-status.js';

/** gksedu.md §10 — the 8 visa states (1F-01). */
describe('visa status machine', () => {
  it('covers all eight states', () => {
    expect(Object.keys(VISA_TRANSITIONS)).toHaveLength(8);
  });

  it('walks collection → submission → approval', () => {
    const path = [VisaStatus.COLLECTING, VisaStatus.REVIEWING, VisaStatus.READY, VisaStatus.SUBMITTED, VisaStatus.APPROVED];
    for (const [index, from] of path.slice(0, -1).entries()) {
      expect(() => assertVisaTransition(from, path[index + 1]!)).not.toThrow();
    }
  });

  it('routes a rejection into a fresh attempt', () => {
    expect(() => assertVisaTransition(VisaStatus.REJECTED, VisaStatus.REAPPLY)).not.toThrow();
    expect(() => assertVisaTransition(VisaStatus.REAPPLY, VisaStatus.COLLECTING)).not.toThrow();
  });

  it('refuses to submit straight from collecting', () => {
    expect(() => assertVisaTransition(VisaStatus.COLLECTING, VisaStatus.SUBMITTED)).toThrow(BadRequestException);
  });

  it('treats an approved visa as final', () => {
    expect(VISA_TRANSITIONS[VisaStatus.APPROVED]).toHaveLength(0);
  });
});
