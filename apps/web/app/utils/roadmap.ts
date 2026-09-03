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
  /** How many months before the intake start applications must be in. */
  applyLeadMonths: number;
  /** Label for the first ("you start now") milestone. */
  prepLabel: string;
}

export const ROADMAP_RULES: Record<RoadmapService, RoadmapRule> = {
  LANGUAGE_PREP: { intakeMonths: [3, 6, 9, 12], applyLeadMonths: 3, prepLabel: 'Хэлний бэлтгэл' },
  BACHELOR: { intakeMonths: [3, 9], applyLeadMonths: 2, prepLabel: 'Бэлтгэл эхлэх' },
  MASTER: { intakeMonths: [3, 9], applyLeadMonths: 2, prepLabel: 'Бэлтгэл эхлэх' },
};

export const ROADMAP_SERVICE_LABELS: Record<RoadmapService, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр, доктор',
};

/** Copy and icon for the "which programme" choice cards on the planner. */
export const ROADMAP_SERVICE_META: Record<RoadmapService, { icon: string; description: string }> = {
  LANGUAGE_PREP: { icon: 'languages', description: 'Солонгос хэлнээс эхлэх' },
  BACHELOR: { icon: 'graduation-cap', description: 'Их сургуульд элсэх' },
  MASTER: { icon: 'book-open', description: 'Мэргэжлээ ахиулах, судалгаа хийх' },
};

export interface RoadmapStep {
  key: string;
  icon: string;
  title: string;
  text: string;
  start: Date;
  end: Date;
}

export interface Roadmap {
  steps: RoadmapStep[];
  destinationDate: Date;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  result.setMonth(result.getMonth() + months);
  return result;
}

const MIN_RUNWAY_DAYS = 21;

/** Upcoming intake start dates for which the application deadline hasn't effectively already passed. */
export function nextIntakeDates(service: RoadmapService, today: Date, count = 3): Date[] {
  const rule = ROADMAP_RULES[service];
  const candidates: Date[] = [];
  for (let yearOffset = 0; yearOffset <= 3 && candidates.length < count + rule.intakeMonths.length; yearOffset++) {
    const year = today.getFullYear() + yearOffset;
    for (const month of rule.intakeMonths) {
      const intake = new Date(year, month - 1, 1);
      if (intake.getTime() <= today.getTime()) continue;
      const deadline = addMonths(intake, -rule.applyLeadMonths);
      if (deadline.getTime() - today.getTime() <= MIN_RUNWAY_DAYS * 86_400_000) continue;
      candidates.push(intake);
    }
  }
  candidates.sort((a, b) => a.getTime() - b.getTime());
  return candidates.slice(0, count);
}

/**
 * Backward-plans a 4-step path between today and a chosen intake start date.
 * "Materials" and "apply" are deliberately merged into one user-facing step
 * ("Элсэлт") — the difference between preparing and sending documents isn't
 * meaningful to a first-time visitor.
 */
export function buildRoadmap(service: RoadmapService, koreaDate: Date, today: Date): Roadmap {
  const rule = ROADMAP_RULES[service];
  const applyDeadline = addMonths(koreaDate, -rule.applyLeadMonths);
  const prepSpan = Math.max(applyDeadline.getTime() - today.getTime(), 0);
  const schoolChoice = new Date(today.getTime() + prepSpan * 0.35);
  const materials = new Date(today.getTime() + prepSpan * 0.7);

  const steps: RoadmapStep[] = [
    {
      key: 'prep',
      icon: 'book-open-check',
      title: rule.prepLabel,
      text: service === 'LANGUAGE_PREP' ? 'TOPIK, суурь хэлний бэлтгэл' : 'Материал, хэлний бэлтгэл эхлэх',
      start: today,
      end: schoolChoice,
    },
    {
      key: 'school',
      icon: 'landmark',
      title: 'Сургууль сонгох',
      text: 'Тохирох сургууль, хөтөлбөр сонгоно',
      start: schoolChoice,
      end: materials,
    },
    {
      key: 'apply',
      icon: 'file-text',
      title: 'Элсэлт',
      text: 'Материалаа бүрдүүлж мэдүүлнэ',
      start: materials,
      end: applyDeadline,
    },
    {
      key: 'visa',
      icon: 'stamp',
      title: 'Виз',
      text: 'Визний материал бүрдүүлж мэдүүлнэ',
      start: applyDeadline,
      end: koreaDate,
    },
  ];

  return { steps, destinationDate: koreaDate };
}

const MONTH_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const SEASON_LABELS: Record<number, string> = {
  3: 'Хаврын элсэлт',
  6: 'Зуны элсэлт',
  9: 'Намрын элсэлт',
  12: 'Өвлийн элсэлт',
};

export function formatMonthShort(date: Date): string {
  return `${MONTH_LABELS[date.getMonth()]}-р сар`;
}

export function formatMonthYear(date: Date): string {
  return `${date.getFullYear()} оны ${formatMonthShort(date)}`;
}

/** Compact "2027.09" form used inside the step-range labels. */
export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDateRange(start: Date, end: Date): string {
  return `${formatYearMonth(start)}–${formatYearMonth(end)}`;
}

/** Empty string for months without a scheduled intake — callers should hide the label then. */
export function seasonLabel(date: Date): string {
  return SEASON_LABELS[date.getMonth() + 1] ?? '';
}

export function monthsUntil(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  return Math.max(months, 1);
}
