import type { Prisma } from '../../prisma/client.js';

/** Same public-safe shape as `UniversitiesService`'s card fields (1A-04). */
export const CARD_SELECT = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  type: true,
  cityMn: true,
  regionMn: true,
  regionEn: true,
  foundedYear: true,
  studentsTotal: true,
  logoPath: true,
  shortIntroMn: true,
  acceptsLanguagePrep: true,
  isGksEligible: true,
  livingCost: true,
} satisfies Prisma.UniversitySelect;
