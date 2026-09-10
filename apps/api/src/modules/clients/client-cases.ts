import { CaseStage } from '../../prisma/client.js';

/**
 * "Which case does the client screen mean?" — one answer, for the list, the
 * detail page and the workspace.
 *
 * A client may run several services over the years (§20: a language-prep client
 * coming back for a bachelor's), so "their case" is a rule, not a column. It
 * was written out three times; a copy that drifts is two screens disagreeing
 * about what a client is currently doing.
 */

/** A case in one of these is over. */
export const TERMINAL_STAGES: CaseStage[] = [CaseStage.COMPLETED, CaseStage.CANCELLED, CaseStage.REJECTED];

/** How close a deadline has to be before a row or the workspace calls it out. */
export const DEADLINE_WARNING_DAYS = 7;

/** The same window in milliseconds, for `dueAt` comparisons. */
export const DEADLINE_WARNING_MS = DEADLINE_WARNING_DAYS * 86_400_000;

/**
 * The case staff are working on: the newest that has not ended, falling back to
 * the newest of any kind for a client whose journey is finished.
 *
 * Expects `cases` newest-first — every caller reads them `orderBy createdAt
 * desc`, which is what makes `find` mean "newest".
 */
export function liveCase<T extends { stage: CaseStage }>(cases: T[]): T | null {
  return cases.find((row) => !TERMINAL_STAGES.includes(row.stage)) ?? cases[0] ?? null;
}
