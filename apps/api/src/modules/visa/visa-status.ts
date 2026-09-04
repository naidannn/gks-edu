import { BadRequestException } from '@nestjs/common';
import { VisaStatus } from '../../prisma/client.js';

/** The 8 visa states of gksedu.md §10 (1F-01). */
export const VISA_TRANSITIONS: Record<VisaStatus, readonly VisaStatus[]> = {
  [VisaStatus.COLLECTING]: [VisaStatus.REVIEWING],
  [VisaStatus.REVIEWING]: [VisaStatus.COLLECTING, VisaStatus.READY],
  [VisaStatus.READY]: [VisaStatus.SUBMITTED],
  [VisaStatus.SUBMITTED]: [VisaStatus.ADDITIONAL_DOCS_REQUESTED, VisaStatus.APPROVED, VisaStatus.REJECTED],
  [VisaStatus.ADDITIONAL_DOCS_REQUESTED]: [VisaStatus.SUBMITTED],
  [VisaStatus.APPROVED]: [],
  [VisaStatus.REJECTED]: [VisaStatus.REAPPLY],
  // Re-applying starts the paperwork over from the top.
  [VisaStatus.REAPPLY]: [VisaStatus.COLLECTING],
};

export function assertVisaTransition(from: VisaStatus, to: VisaStatus): void {
  if (!VISA_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`Визний хэргийг ${from} төлөвөөс ${to} рүү шилжүүлэх боломжгүй`);
  }
}
