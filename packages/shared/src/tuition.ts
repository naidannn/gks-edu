import type { ProgramLevel } from './types/university';

/**
 * The web app's copy of the annual-tuition arithmetic.
 *
 * `apps/api` mirrors it in `src/modules/programs/tuition.ts` because it does
 * not depend on this package — the numbers below have to be changed in both.
 */

/**
 * How many tuition terms a year of study has, per level.
 *
 * Korean schools publish tuition per term (`tuitionPerTermKrw`) and the
 * database stores it that way — the annual figure is derived on read, never
 * written (CLAUDE.md, ARCHITECTURE.md §3.3). Degree programmes run two
 * semesters a year; language institutes run four 10-week terms, so the same
 * ×2 would understate a language-prep year by half.
 */
export const TERMS_PER_YEAR: Record<ProgramLevel, number> = {
  LANGUAGE_PREP: 4,
  BACHELOR: 2,
  MASTER: 2,
  PHD: 2,
};

/**
 * The annual tuition a visitor is shown: the school's own annual figure when
 * it published one, otherwise the per-term figure × terms in a year. `null`
 * when neither is known — render it as "мэдээлэл шинэчлэгдэж байна", never 0.
 */
export function annualTuitionKrw(program: {
  level: ProgramLevel;
  tuitionPerYearKrw: number | null;
  tuitionPerTermKrw: number | null;
}): number | null {
  if (program.tuitionPerYearKrw !== null && program.tuitionPerYearKrw !== undefined) return program.tuitionPerYearKrw;
  if (program.tuitionPerTermKrw === null || program.tuitionPerTermKrw === undefined) return null;
  return program.tuitionPerTermKrw * TERMS_PER_YEAR[program.level];
}

/** A language institute's 10-week term, in calendar months, for labels. */
export const LANGUAGE_TERM_MONTHS = 3;

/**
 * What a language institute bills a new student in one go: its minimum
 * enrolment (`minEnrollmentTerms`, 2 or 4 terms) at its per-term price.
 * `null` for any other level, or while the school's minimum is unknown.
 *
 * Mirrored in `apps/api/src/modules/programs/tuition.ts`.
 */
export function languagePrepEnrollment(program: {
  level: ProgramLevel;
  minEnrollmentTerms?: number | null;
  tuitionPerTermKrw: number | null;
}): { terms: number; months: number; totalKrw: number | null } | null {
  if (program.level !== 'LANGUAGE_PREP' || !program.minEnrollmentTerms) return null;
  const terms = program.minEnrollmentTerms;
  return {
    terms,
    months: terms * LANGUAGE_TERM_MONTHS,
    totalKrw: program.tuitionPerTermKrw === null ? null : program.tuitionPerTermKrw * terms,
  };
}

/** "6 сар (2 улирал)" / "1 жил (4 улирал)" — how the office says it. */
export function enrollmentPeriodLabel(terms: number): string {
  const months = terms * LANGUAGE_TERM_MONTHS;
  const period = months % 12 === 0 ? `${months / 12} жил` : `${months} сар`;
  return `${period} (${terms} улирал)`;
}
