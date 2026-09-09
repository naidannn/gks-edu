import type {
  EnglishLevel,
  GksBlocker,
  GksDegree,
  GksEligibilityVerdict,
  GksFactorLevel,
  GksImpact,
  GksStrength,
  GpaScale,
} from '@gks/shared';
import type { PlanChoice } from '~/utils/study-plan';

/**
 * The GKS self-check's question sheet (ARCHITECTURE.md §3.5).
 *
 * Same discipline as the planner's: every question is a tap except the two
 * numbers nobody can guess for the visitor — their age and their grade. This
 * page is where a Facebook ad lands, so the first screen has to be answerable
 * with a thumb, in a queue, in under a minute.
 */

export const GKS_DEGREE_CHOICES: PlanChoice<GksDegree>[] = [
  { value: 'BACHELOR', label: 'Бакалавр', hint: '25 нас хүртэл', icon: 'graduation-cap' },
  { value: 'MASTER', label: 'Магистр', hint: '40 нас хүртэл', icon: 'book-open' },
  { value: 'PHD', label: 'Доктор', hint: '40 нас хүртэл', icon: 'award' },
];

/**
 * Education as a single question.
 *
 * The API takes a level and a "still studying" flag, but nobody thinks in two
 * fields — they think "би 12-т сурч байна". Each choice below is that sentence,
 * and the page splits it back into the two the API wants.
 */
export interface EducationChoice extends PlanChoice<string> {
  education: 'SECONDARY_SCHOOL' | 'VOCATIONAL' | 'BACHELOR' | 'MASTER';
  graduating: boolean;
}

export const GKS_EDUCATION_CHOICES: EducationChoice[] = [
  {
    value: 'SECONDARY_STUDYING',
    label: 'ЕБС-д сурч байна',
    hint: 'Энэ жил төгсөнө',
    icon: 'school',
    education: 'SECONDARY_SCHOOL',
    graduating: true,
  },
  {
    value: 'SECONDARY_DONE',
    label: 'ЕБС төгссөн',
    icon: 'school',
    education: 'SECONDARY_SCHOOL',
    graduating: false,
  },
  {
    value: 'VOCATIONAL_DONE',
    label: 'МСҮТ, коллеж төгссөн',
    icon: 'wrench',
    education: 'VOCATIONAL',
    graduating: false,
  },
  {
    value: 'BACHELOR_STUDYING',
    label: 'Бакалаврт сурч байна',
    hint: 'Энэ жил төгсөнө',
    icon: 'graduation-cap',
    education: 'BACHELOR',
    graduating: true,
  },
  {
    value: 'BACHELOR_DONE',
    label: 'Бакалавр төгссөн',
    icon: 'graduation-cap',
    education: 'BACHELOR',
    graduating: false,
  },
  {
    value: 'MASTER_DONE',
    label: 'Магистр төгссөн',
    icon: 'book-open',
    education: 'MASTER',
    graduating: false,
  },
];

/**
 * The genitive form of each award's name.
 *
 * Mongolian glues the case ending onto the word — "Бакалаврын", not
 * "Бакалавр-ын" — so a label plus an interpolated suffix is not a sentence a
 * reader trusts. Four words is cheaper than a morphology helper.
 */
export const GKS_DEGREE_GENITIVE: Record<GksDegree, string> = {
  BACHELOR: 'Бакалаврын',
  MASTER: 'Магистрын',
  PHD: 'Докторын',
};

/** The wizard's own key for a level + "still studying" pair. */
export function educationKey(education: string, graduating: boolean): string {
  return GKS_EDUCATION_CHOICES.find(
    (choice) => choice.education === education && choice.graduating === graduating,
  )?.value ?? '';
}

/**
 * The scales a Mongolian transcript arrives on.
 *
 * Asked rather than assumed: `gksedu.md` §24 question 1 has been open since the
 * spec was written precisely because no one scale covers our applicants, and a
 * grade read on the wrong one is the difference between "тэнцэнэ" and
 * "тэнцэхгүй" — the one thing this page must not get wrong.
 */
export const GPA_SCALE_OPTIONS: { value: GpaScale; label: string }[] = [
  { value: '100', label: '100 оноо (хувь)' },
  { value: '4.0', label: '4.0 систем' },
  { value: '4.3', label: '4.3 систем' },
  { value: '4.5', label: '4.5 систем' },
  { value: '5.0', label: '5.0 систем' },
];

/** The passing mark on each scale, shown live under the grade field. */
export const GPA_FLOOR_HINT: Record<GpaScale, string> = {
  '100': 'Шалгуур: 80 ба түүнээс дээш',
  '4.0': 'Шалгуур: 2.64 ба түүнээс дээш',
  '4.3': 'Шалгуур: 2.80 ба түүнээс дээш',
  '4.5': 'Шалгуур: 2.91 ба түүнээс дээш',
  '5.0': 'Шалгуур: 3.23 ба түүнээс дээш',
};

export const GKS_TOPIK_CHOICES: PlanChoice<number>[] = [
  { value: 0, label: 'Үгүй', icon: 'circle-dashed' },
  { value: 1, label: 'TOPIK 1', icon: 'signal-low' },
  { value: 2, label: 'TOPIK 2', icon: 'signal-low' },
  { value: 3, label: 'TOPIK 3', icon: 'signal-medium' },
  { value: 4, label: 'TOPIK 4', icon: 'signal-medium' },
  { value: 5, label: 'TOPIK 5', icon: 'signal-high' },
  { value: 6, label: 'TOPIK 6', icon: 'signal-high' },
];

export const GKS_ENGLISH_CHOICES: PlanChoice<EnglishLevel>[] = [
  { value: 'NONE', label: 'Үгүй', icon: 'circle-dashed' },
  { value: 'INTERMEDIATE', label: 'IELTS 5.5–6.0', hint: 'эсвэл TOEFL 60–79', icon: 'signal-medium' },
  { value: 'ADVANCED', label: 'IELTS 6.5+', hint: 'эсвэл TOEFL 80+', icon: 'signal-high' },
];

/**
 * The strengths a person can honestly claim about themselves.
 *
 * `TOP_20_PERCENT` heads the list because it is not a bonus at all — it is the
 * guideline's alternative to the grade floor, and it is the single tick that
 * turns "шалгуур хангахгүй" into "хангана" for somebody whose university marks
 * on a hard curve.
 */
export const STRENGTH_CHOICES: { value: GksStrength; label: string; hint?: string; icon: string }[] = [
  { value: 'TOP_20_PERCENT', label: 'Ангидаа эхний 20%-д ордог', hint: 'Голчийн шалгуурыг орлоно', icon: 'trophy' },
  { value: 'AWARD', label: 'Олимпиад, тэмцээний шагналтай', icon: 'medal' },
  { value: 'RESEARCH', label: 'Судалгаа, нийтлэл хийсэн', icon: 'flask-conical' },
  { value: 'WORK', label: 'Мэргэжлээрээ ажилласан туршлагатай', icon: 'briefcase' },
  { value: 'VOLUNTEER', label: 'Сайн дурын ажилд оролцсон', icon: 'heart-handshake' },
  { value: 'KOREAN_STUDY', label: 'Солонгос хэл, соёлын сургалтад хамрагдсан', icon: 'languages' },
  { value: 'DOCS_STARTED', label: 'Эсээ, төлөвлөгөөгөө бичиж эхэлсэн', icon: 'file-pen' },
];

/**
 * The four conditions that end an application.
 *
 * Not a wizard step: they sit on the result, beside the criteria they decide.
 * Almost nobody ticks one, and putting a screen of disqualifiers between a
 * visitor and their answer is how a one-minute funnel loses the people it was
 * built for — they are a correction, not a question.
 */
export const BLOCKER_CHOICES: { value: GksBlocker; label: string; icon: string }[] = [
  { value: 'KOREAN_CITIZEN', label: 'Би эсвэл эцэг эх маань БНСУ-ын иргэн', icon: 'flag' },
  { value: 'PREVIOUS_GKS', label: 'Өмнө нь GKS тэтгэлэг авч байсан', icon: 'history' },
  { value: 'DEGREE_IN_KOREA', label: 'Солонгост ижил түвшний зэрэг хамгаалсан', icon: 'graduation-cap' },
  { value: 'HEALTH', label: 'Эрүүл мэндийн байнгын хяналттай', icon: 'stethoscope' },
];

export const VERDICT_TONE: Record<GksEligibilityVerdict, 'ok' | 'warn' | 'stop'> = {
  PASS: 'ok',
  REVIEW: 'warn',
  BLOCKED: 'stop',
};

export const VERDICT_ICON: Record<GksEligibilityVerdict, string> = {
  PASS: 'circle-check',
  REVIEW: 'circle-alert',
  BLOCKED: 'circle-x',
};

/**
 * How full a factor's three-segment indicator is drawn.
 *
 * Segments, not a percentage: the API deliberately reports a word rather than
 * a mark (`ARCHITECTURE.md` §3.5), and the picture beside that word has to be
 * as coarse as the word is. A bar filled to 68% is a number in disguise.
 */
export const FACTOR_LEVEL_SEGMENTS: Record<GksFactorLevel, number> = {
  NONE: 0,
  PARTIAL: 1,
  GOOD: 2,
  FULL: 3,
};

export const FACTOR_LEVEL_TONE: Record<GksFactorLevel, 'ok' | 'mid' | 'low' | 'none'> = {
  FULL: 'ok',
  GOOD: 'mid',
  PARTIAL: 'low',
  NONE: 'none',
};

/** The first move is the one to make; the badge says so in words. */
export const IMPACT_TONE: Record<GksImpact, 'high' | 'mid' | 'low'> = {
  HIGH: 'high',
  MEDIUM: 'mid',
  LOW: 'low',
};

export const CRITERION_ICON = { true: 'circle-check', false: 'circle-x', null: 'circle-help' } as const;

/** "2027 оны 2-р сар" — the phrase every date on this page is written in. */
export function formatMonth(year: number, month: number): string {
  return `${year} оны ${month}-р сар`;
}

/**
 * A service fee, or the honest blank.
 *
 * `formatMnt` (labels.ts) is the app's one money formatter and returns `null`
 * for an unknown figure; a price card cannot render nothing, and it must not
 * render a confident zero either — so an absent `ServicePricing` row says it is
 * being confirmed.
 */
export function formatFee(amount: number | null): string {
  return formatMnt(amount) ?? 'Тодруулж байна';
}
