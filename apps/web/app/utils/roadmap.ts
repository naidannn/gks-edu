import type { ServiceType } from '@gks/shared';

/**
 * Roadmap-eligible services and their intake calendar. This mirrors the
 * admission cycle documented in gksedu.md §4.1–§4.2 and the `IntakeTerm`
 * schema comment ("Language prep runs four a year, degree programmes two").
 *
 * These are general averages for the teaser/lead-capture widget on the
 * homepage — not a specific university's exact deadline (no `IntakeTerm`
 * rows are seeded yet). Treat as admin-tunable, like `ServicePricing`.
 */
export type RoadmapService = Extract<ServiceType, 'LANGUAGE_PREP' | 'BACHELOR' | 'MASTER'>;

interface RoadmapRule {
  /** Calendar months (1–12) a new term starts. */
  intakeMonths: number[];
  /** Calendar months between the registration month and the intake month. */
  registrationLeadMonths: number;
}

export const ROADMAP_RULES: Record<RoadmapService, RoadmapRule> = {
  LANGUAGE_PREP: { intakeMonths: [3, 6, 9, 12], registrationLeadMonths: 2 },
  BACHELOR: { intakeMonths: [3, 9], registrationLeadMonths: 2 },
  MASTER: { intakeMonths: [3, 9], registrationLeadMonths: 2 },
};

export const ROADMAP_SERVICE_LABELS: Record<RoadmapService, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр, доктор',
};

/** Icon for each programme choice in the planner. */
export const ROADMAP_SERVICE_META: Record<RoadmapService, { icon: string }> = {
  LANGUAGE_PREP: { icon: 'languages' },
  BACHELOR: { icon: 'graduation-cap' },
  MASTER: { icon: 'book-open' },
};

export interface Roadmap {
  registrationDeadline: Date;
  destinationDate: Date;
  durationDays: number;
}

const MILLISECONDS_PER_DAY = 86_400_000;

/** Calendar-day distance that is stable across daylight-saving/timezone changes. */
export function daysBetweenDates(from: Date, to: Date): number {
  const fromUtc = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.max(Math.round((toUtc - fromUtc) / MILLISECONDS_PER_DAY), 0);
}

/**
 * Registration closes at the end of the month two calendar months before
 * classes begin. For example, a March intake closes on 31 January.
 */
export function registrationDeadline(service: RoadmapService, intake: Date): Date {
  const leadMonths = ROADMAP_RULES[service].registrationLeadMonths;
  return new Date(intake.getFullYear(), intake.getMonth() - leadMonths + 1, 0, 23, 59, 59, 999);
}

/** Upcoming intake start dates whose registration deadline has not passed. */
export function nextIntakeDates(service: RoadmapService, today: Date, count = 3): Date[] {
  const rule = ROADMAP_RULES[service];
  const candidates: Date[] = [];
  for (let yearOffset = 0; yearOffset <= 3 && candidates.length < count + rule.intakeMonths.length; yearOffset++) {
    const year = today.getFullYear() + yearOffset;
    for (const month of rule.intakeMonths) {
      const intake = new Date(year, month - 1, 1, 12);
      if (intake.getTime() <= today.getTime()) continue;
      if (registrationDeadline(service, intake).getTime() < today.getTime()) continue;
      candidates.push(intake);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates.slice(0, count);
}

/** The two dates shown by the compact homepage planner. */
export function buildRoadmap(service: RoadmapService, koreaDate: Date): Roadmap {
  const deadline = registrationDeadline(service, koreaDate);
  return {
    registrationDeadline: deadline,
    destinationDate: koreaDate,
    durationDays: daysBetweenDates(deadline, koreaDate),
  };
}

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export function formatMonthShort(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()]}-р сар`;
}

export function formatMonthYear(date: Date): string {
  return `${date.getFullYear()} оны ${formatMonthShort(date)}`;
}

export function formatFullDate(date: Date): string {
  return `${date.getFullYear()} оны ${date.getMonth() + 1}-р сарын ${date.getDate()}`;
}
