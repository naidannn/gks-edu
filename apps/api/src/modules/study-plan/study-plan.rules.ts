import { EducationLevel, ProgramLevel, ServiceType } from '../../prisma/client.js';

/**
 * The planning arithmetic behind `/study-plan` (ARCHITECTURE.md §3.4).
 *
 * Pure on purpose — no Prisma, no clock of its own — for the same reason
 * `intake-deadline.ts` is: there has to be exactly one answer to "when could
 * this person be in Korea", and it has to be testable against a fixed `now`.
 *
 * Everything in this file is a **current business value**, not a constant.
 * How long a TOPIK level takes and which months a degree starts in are the
 * office's numbers, and the day they move they move here — see the open
 * question in ARCHITECTURE.md §18.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a person may apply to, given the diploma they already hold.
 *
 * Language prep is on every row: it takes anyone, and for most of our clients
 * it is the first stage rather than the destination. A degree at the level
 * already held stays available too — repeating a bachelor's in Korea is a real
 * choice, not a mistake to design out.
 */
export const GOALS_FOR_EDUCATION: Record<EducationLevel, readonly ProgramLevel[]> = {
  [EducationLevel.SECONDARY_SCHOOL]: [ProgramLevel.LANGUAGE_PREP, ProgramLevel.BACHELOR],
  [EducationLevel.VOCATIONAL]: [ProgramLevel.LANGUAGE_PREP, ProgramLevel.BACHELOR],
  [EducationLevel.BACHELOR]: [ProgramLevel.LANGUAGE_PREP, ProgramLevel.BACHELOR, ProgramLevel.MASTER],
  [EducationLevel.MASTER]: [ProgramLevel.LANGUAGE_PREP, ProgramLevel.MASTER, ProgramLevel.PHD],
  [EducationLevel.PHD]: [ProgramLevel.LANGUAGE_PREP, ProgramLevel.PHD],
};

export function isGoalReachable(education: EducationLevel, goal: ProgramLevel): boolean {
  return GOALS_FOR_EDUCATION[education].includes(goal);
}

/** Which service line a plan at this level would be sold as (§5). */
export const SERVICE_FOR_LEVEL: Record<ProgramLevel, ServiceType> = {
  [ProgramLevel.LANGUAGE_PREP]: ServiceType.LANGUAGE_PREP,
  [ProgramLevel.BACHELOR]: ServiceType.BACHELOR,
  [ProgramLevel.MASTER]: ServiceType.MASTER,
  [ProgramLevel.PHD]: ServiceType.PHD,
};

/**
 * The TOPIK level a Korean-taught programme at this level usually wants, used
 * *only* when not one matching programme published its own requirement.
 *
 * A guess is worth making here: told nothing, a visitor assumes their Korean is
 * enough, and finding out otherwise a year later is the expensive version of
 * this mistake. The plan labels it as a general figure.
 */
export const FALLBACK_TOPIK_REQUIREMENT: Record<ProgramLevel, number> = {
  [ProgramLevel.LANGUAGE_PREP]: 0,
  [ProgramLevel.BACHELOR]: 3,
  [ProgramLevel.MASTER]: 3,
  [ProgramLevel.PHD]: 3,
};

/**
 * Months of full-time study in Korea per TOPIK level gained — the office's own
 * figure, and one term at a language institute. Zero to TOPIK 3, the usual
 * degree entry, is nine months on it.
 *
 * The floor is one level rather than a visa's length: a single level is a real
 * plan, and rounding it up to six months would quietly overrule the rate above
 * for exactly the people closest to the door. The ceiling is a guard — six
 * levels from nothing is eighteen months, so it never binds today.
 */
export const MONTHS_PER_TOPIK_LEVEL = 3;
export const MIN_PREP_MONTHS = MONTHS_PER_TOPIK_LEVEL;
export const MAX_PREP_MONTHS = 24;

/** How long the language stage runs, in whole terms. */
export function prepMonths(fromTopik: number, toTopik: number): number {
  const levels = Math.max(toTopik - fromTopik, 0);
  const months = levels * MONTHS_PER_TOPIK_LEVEL;
  return Math.min(Math.max(months, MIN_PREP_MONTHS), MAX_PREP_MONTHS);
}

/**
 * The months each level starts in (§4.1). Language institutes run all four
 * quarters; degrees take the March and September semesters.
 */
export const INTAKE_MONTHS_BY_LEVEL: Record<ProgramLevel, readonly number[]> = {
  [ProgramLevel.LANGUAGE_PREP]: [3, 6, 9, 12],
  [ProgramLevel.BACHELOR]: [3, 9],
  [ProgramLevel.MASTER]: [3, 9],
  [ProgramLevel.PHD]: [3, 9],
};

/**
 * How far ahead of classes registration closes when we have no `IntakeTerm`
 * row to read a real deadline off. Two months is the office's rule of thumb and
 * the figure the homepage planner has always shown.
 */
export const FALLBACK_LEAD_MONTHS = 2;

export interface CalendarIntake {
  year: number;
  month: number;
  /** End of the month `FALLBACK_LEAD_MONTHS` before classes start. */
  registerBy: Date;
  classStart: Date;
}

/**
 * Intake months from the academic calendar whose registration window is still
 * open — the fallback for a level with no published rounds yet, and the reason
 * the planner works before the calendar is fully entered.
 */
export function calendarIntakes(
  level: ProgramLevel,
  now: Date,
  options: { count?: number; notBefore?: Date } = {},
): CalendarIntake[] {
  const count = options.count ?? 3;
  const floor = options.notBefore ?? now;
  const months = INTAKE_MONTHS_BY_LEVEL[level];
  const found: CalendarIntake[] = [];

  for (let offset = 0; offset <= 3 && found.length < count; offset += 1) {
    const year = now.getUTCFullYear() + offset;
    for (const month of months) {
      // The 1st at noon UTC: far enough from either midnight that a timezone
      // never moves the month the answer is phrased in.
      const classStart = new Date(Date.UTC(year, month - 1, 1, 12));
      if (classStart.getTime() <= floor.getTime()) continue;

      const registerBy = new Date(Date.UTC(year, month - FALLBACK_LEAD_MONTHS, 0, 23, 59, 59, 999));
      if (registerBy.getTime() < now.getTime()) continue;

      found.push({ year, month, registerBy, classStart });
      if (found.length >= count) break;
    }
  }

  return found.sort((a, b) => a.classStart.getTime() - b.classStart.getTime());
}

/** Whole days from `now` to `target`; negative once it has passed. */
export function daysUntil(target: Date | null | undefined, now: Date): number | null {
  if (!target) return null;
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}

/** `now` plus a whole number of months, keeping the day of the month. */
export function addMonths(from: Date, months: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, from.getUTCDate(), 12));
}

/**
 * Does this person need the language stage before the degree they want?
 *
 * `directMatches` is the count of programmes they already qualify for — taught
 * in English, asking a TOPIK level they hold, or publishing no requirement at
 * all. The gate is deliberately *empirical*: as long as one real programme in
 * the catalogue would take them, the plan does not send them to a language
 * school for a year.
 *
 * `matchesAtGoalLevel` is the same set with the TOPIK condition lifted, and it
 * is what stops the gate misreading an empty result. Both counts must be taken
 * over the *questions the visitor answered* — level and subject — never over
 * the region and budget chips on the result: an empty list because nothing in
 * Пусан is affordable is a money answer, and telling that person to spend a
 * year learning Korean instead would be a confident, wrong one. When the wider
 * count is zero too, the catalogue simply has nothing to offer here, and no
 * amount of Korean changes that.
 */
export function needsLanguageStage(
  goal: ProgramLevel,
  directMatches: number,
  matchesAtGoalLevel: number,
): boolean {
  if (goal === ProgramLevel.LANGUAGE_PREP) return false;
  return directMatches === 0 && matchesAtGoalLevel > 0;
}

/**
 * The first-year cost of one stage, summed across its lines.
 *
 * A line we know nothing about contributes nothing rather than dragging the
 * total to null — a total missing one component is more useful than no total,
 * and the card lists which lines it is built from.
 */
export function sumRange(
  lines: { minMnt: number | null; maxMnt: number | null }[],
): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;
  for (const line of lines) {
    if (line.minMnt !== null) min = (min ?? 0) + line.minMnt;
    if (line.maxMnt !== null) max = (max ?? 0) + line.maxMnt;
  }
  return { min, max };
}
