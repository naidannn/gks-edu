import { BadRequestException } from '@nestjs/common';
import { ApplicationStatus } from '../../prisma/client.js';

/**
 * The 9 application states of gksedu.md §7 (1E-02). The two-round GKS decision
 * is not a state — it is `ApplicationResult.round`, so a scholarship case sits
 * in `UNDER_REVIEW` between rounds rather than needing states of its own.
 */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  [ApplicationStatus.PREPARING]: [ApplicationStatus.READY],
  [ApplicationStatus.READY]: [ApplicationStatus.PREPARING, ApplicationStatus.SUBMITTED],
  [ApplicationStatus.SUBMITTED]: [ApplicationStatus.UNDER_REVIEW],
  [ApplicationStatus.UNDER_REVIEW]: [
    ApplicationStatus.ADDITIONAL_DOCS_REQUESTED,
    ApplicationStatus.INTERVIEW_SCHEDULED,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.DEFERRED,
  ],
  [ApplicationStatus.ADDITIONAL_DOCS_REQUESTED]: [ApplicationStatus.UNDER_REVIEW],
  [ApplicationStatus.INTERVIEW_SCHEDULED]: [
    ApplicationStatus.UNDER_REVIEW,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.DEFERRED,
  ],
  // A deferred applicant is reconsidered in a later round, not re-submitted.
  [ApplicationStatus.DEFERRED]: [ApplicationStatus.UNDER_REVIEW, ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED],
  [ApplicationStatus.ACCEPTED]: [],
  [ApplicationStatus.REJECTED]: [],
};

export function assertApplicationTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!APPLICATION_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(`Мэдүүлгийг ${from} төлөвөөс ${to} рүү шилжүүлэх боломжгүй`);
  }
}
