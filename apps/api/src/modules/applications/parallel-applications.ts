import { CaseChoiceTrack, ServiceType } from '../../prisma/client.js';

/**
 * Which of a case's chosen schools may carry an application of their own beside
 * the primary one (1E-13).
 *
 * A GKS case's scholarship schools are all one NIIED submission — the primary
 * application — so only its `REGULAR` choice, the free ordinary-brokerage school
 * of contract §3.11, is applied to separately. A regular case's primary is its
 * first choice; every other school on the list is a parallel application.
 */
export interface ChoiceLike {
  universityId: string;
  track: CaseChoiceTrack;
}

export function parallelChoices<T extends ChoiceLike>(
  serviceType: ServiceType,
  choices: readonly T[],
  primaryUniversityId: string | null,
): T[] {
  return choices.filter((choice) => {
    if (choice.universityId === primaryUniversityId) return false;
    return serviceType === ServiceType.GKS_SCHOLARSHIP ? choice.track === CaseChoiceTrack.REGULAR : true;
  });
}
