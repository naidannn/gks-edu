import type { EducationLevel, ProgramLevel, StudyPlanDateSource, TopikLevel } from '@gks/shared';

/**
 * The planner's question sheet (ARCHITECTURE.md §3.4).
 *
 * Every question is a tap, never a text field: the whole point of the page is
 * that somebody who does not yet know what to ask gets a real answer in four
 * taps. Icons carry as much of the meaning as the labels do.
 */

export interface PlanChoice<T> {
  value: T;
  label: string;
  /** One short line under the label. Omitted where the label says it all. */
  hint?: string;
  icon: string;
}

export const EDUCATION_CHOICES: PlanChoice<EducationLevel>[] = [
  { value: 'SECONDARY_SCHOOL', label: 'Бүрэн дунд', hint: '12 жил төгссөн', icon: 'school' },
  { value: 'VOCATIONAL', label: 'Мэргэжлийн', hint: 'МСҮТ, коллеж', icon: 'wrench' },
  { value: 'BACHELOR', label: 'Бакалавр', hint: 'Дээд боловсрол', icon: 'graduation-cap' },
  { value: 'MASTER', label: 'Магистр', icon: 'book-open' },
  { value: 'PHD', label: 'Доктор', icon: 'award' },
];

export const GOAL_CHOICES: PlanChoice<ProgramLevel>[] = [
  { value: 'LANGUAGE_PREP', label: 'Хэлний бэлтгэл', hint: 'Солонгос хэл', icon: 'languages' },
  { value: 'BACHELOR', label: 'Бакалавр', hint: '4 жил', icon: 'graduation-cap' },
  { value: 'MASTER', label: 'Магистр', hint: '2 жил', icon: 'book-open' },
  { value: 'PHD', label: 'Доктор', hint: '3+ жил', icon: 'award' },
];

/**
 * Exact levels rather than bands. A band has to be read as its top or its
 * bottom, and either choice quietly moves the answer for somebody sitting at
 * the other end of it.
 */
export const TOPIK_CHOICES: PlanChoice<TopikLevel>[] = [
  { value: 0, label: 'Мэдэхгүй', hint: 'Шинээр эхэлнэ', icon: 'circle-dashed' },
  { value: 1, label: 'TOPIK 1', icon: 'signal-low' },
  { value: 2, label: 'TOPIK 2', icon: 'signal-low' },
  { value: 3, label: 'TOPIK 3', icon: 'signal-medium' },
  { value: 4, label: 'TOPIK 4', icon: 'signal-medium' },
  { value: 5, label: 'TOPIK 5', icon: 'signal-high' },
  { value: 6, label: 'TOPIK 6', icon: 'signal-high' },
];

/** Round numbers a family budgets in — the same ladder as the catalogue's. */
export const BUDGET_CHOICES = [
  { value: '', label: 'Хамаагүй' },
  { value: '4000000', label: '₩4 сая хүртэл' },
  { value: '6000000', label: '₩6 сая хүртэл' },
  { value: '8000000', label: '₩8 сая хүртэл' },
  { value: '10000000', label: '₩10 сая хүртэл' },
];

const MONTH_SEASONS: Record<number, string> = { 3: 'хавар', 6: 'зун', 9: 'намар', 12: 'өвөл' };

/** "2027 оны 3-р сар" — the phrase the whole answer is built around. */
export function formatIntakeMonth(year: number, month: number): string {
  return `${year} оны ${month}-р сар`;
}

export function intakeSeason(month: number): string | null {
  return MONTH_SEASONS[month] ?? null;
}

/**
 * "2027 оны 1-р сарын 24" — a deadline is written out in full, and read in UTC.
 *
 * The UTC part is the load-bearing bit. An intake deadline is stored as the end
 * of its day in UTC (`23:59:59Z`), so reading it in Ulaanbaatar's +08 turns
 * "24 January" into "25 January" — a deadline shown a day *later* than the one
 * the office works to, which is the expensive direction to be wrong in. The
 * catalogue's own `/admissions` list still formats locally; which of the two is
 * right for the whole app is an open question (ARCHITECTURE.md §18), and until
 * it is settled the planner takes the earlier reading.
 */
export function formatPlanDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()} оны ${date.getUTCMonth() + 1}-р сарын ${date.getUTCDate()}`;
}

/**
 * How a date is qualified in the UI.
 *
 * An `ESTIMATED` month comes from the academic calendar because no school has
 * published that round yet — useful to plan around, and never to be shown as a
 * date somebody can miss.
 */
export const DATE_SOURCE_NOTE: Record<StudyPlanDateSource, string | null> = {
  REAL: null,
  ESTIMATED: 'Ерөнхий хуанлиар тооцсон ойролцоо хугацаа',
};

/** "1 жил 3 сар" — months read as a duration a person can picture. */
export function formatMonths(months: number | null): string | null {
  if (months === null || months <= 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return `${rest} сар`;
  return rest ? `${years} жил ${rest} сар` : `${years} жил`;
}
