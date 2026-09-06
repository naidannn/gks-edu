import { BadRequestException } from '@nestjs/common';
import { CaseChoiceTrack, ServiceType } from '../../prisma/client.js';

/**
 * How many schools one case may name, and on which track.
 *
 * A GKS case is two applications in one contract: the scholarship itself, which
 * the client enters with two schools, and the single ordinary-brokerage school
 * §3.11 of the contract grants free of charge so a refused scholarship still
 * leaves somewhere to go. Every other service is ordinary brokerage throughout
 * and may name up to three schools.
 *
 * None of this touches the price — the fee is per service, never per school
 * (`gksedu.md` §5.4) — so nothing here reads `ServicePricing`.
 */

export const MAX_GKS_SCHOLARSHIP_CHOICES = 2;
export const MAX_GKS_EXTRA_REGULAR_CHOICES = 1;
export const MAX_REGULAR_CHOICES = 3;

export interface ChoiceLimits {
  scholarship: number;
  regular: number;
}

export interface UniversityChoiceInput {
  universityId: string;
  programId?: string | null;
  track?: CaseChoiceTrack | null;
  major?: string | null;
  note?: string | null;
}

/** A validated choice, carrying the position it will be stored at. */
export interface NormalisedChoice {
  universityId: string;
  programId: string | null;
  track: CaseChoiceTrack;
  sortOrder: number;
  major: string | null;
  note: string | null;
}

export function choiceLimits(serviceType: ServiceType): ChoiceLimits {
  return serviceType === ServiceType.GKS_SCHOLARSHIP
    ? { scholarship: MAX_GKS_SCHOLARSHIP_CHOICES, regular: MAX_GKS_EXTRA_REGULAR_CHOICES }
    : { scholarship: 0, regular: MAX_REGULAR_CHOICES };
}

/** The track a choice belongs to when the caller does not say. */
export function defaultTrack(serviceType: ServiceType): CaseChoiceTrack {
  return serviceType === ServiceType.GKS_SCHOLARSHIP ? CaseChoiceTrack.SCHOLARSHIP : CaseChoiceTrack.REGULAR;
}

/**
 * Validates the list and puts it in preference order: the scholarship schools
 * first, then the extra ordinary one. The order matters beyond presentation —
 * `Case.universityId` mirrors the first row, so a GKS case must not end up
 * pointing at its fallback school.
 *
 * Throws `BadRequestException` with a Mongolian message; these reach staff
 * verbatim on the registration form.
 */
export function normaliseChoices(
  serviceType: ServiceType,
  choices: readonly UniversityChoiceInput[],
): NormalisedChoice[] {
  const limits = choiceLimits(serviceType);
  const seen = new Set<string>();
  const scholarship: NormalisedChoice[] = [];
  const regular: NormalisedChoice[] = [];

  for (const choice of choices) {
    if (seen.has(choice.universityId)) {
      throw new BadRequestException('Нэг сургуулийг хоёр удаа сонгож болохгүй');
    }
    seen.add(choice.universityId);

    const track = choice.track ?? defaultTrack(serviceType);
    if (track === CaseChoiceTrack.SCHOLARSHIP && limits.scholarship === 0) {
      throw new BadRequestException(
        'Тэтгэлгийн сургуулийн сонголт зөвхөн Засгийн газрын тэтгэлгийн үйлчилгээнд боломжтой',
      );
    }

    (track === CaseChoiceTrack.SCHOLARSHIP ? scholarship : regular).push({
      universityId: choice.universityId,
      programId: choice.programId ?? null,
      track,
      sortOrder: 0,
      major: choice.major?.trim() || null,
      note: choice.note?.trim() || null,
    });
  }

  if (scholarship.length > limits.scholarship) {
    throw new BadRequestException(
      `Засгийн газрын тэтгэлэгт хамгийн ихдээ ${limits.scholarship} сургууль сонгоно`,
    );
  }
  if (regular.length > limits.regular) {
    throw new BadRequestException(
      serviceType === ServiceType.GKS_SCHOLARSHIP
        ? `Тэтгэлгийн үйлчилгээн дээр нэмэлт энгийн зуучлалаар хамгийн ихдээ ${limits.regular} сургууль сонгоно`
        : `Энгийн зуучлалд хамгийн ихдээ ${limits.regular} сургууль сонгоно`,
    );
  }

  return [...scholarship, ...regular].map((choice, index) => ({ ...choice, sortOrder: index }));
}

/** The school the case itself points at — the first preference, or none. */
export function primaryChoice(choices: readonly NormalisedChoice[]): NormalisedChoice | null {
  return choices[0] ?? null;
}
