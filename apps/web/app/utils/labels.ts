/**
 * Mongolian labels for database enums, and the house rules for formatting
 * numbers the dataset may not know.
 *
 * Enum values stay English SCREAMING_SNAKE in the database; every screen reads
 * its label from here so a wording change lands in one place (CLAUDE.md).
 */
import type {
  AccreditationGrade,
  AgentContractStatus,
  BannerPlacement,
  ApplicationDecision,
  ApplicationStatus,
  AppointmentStatus,
  BalanceTrigger,
  CaseStage,
  ClientStatus,
  ContractStatus,
  ContractType,
  DocStage,
  DocumentStatus,
  EducationLevel,
  FaqCategory,
  Gender,
  GuarantorRelation,
  GuarantorType,
  InvoiceItemKind,
  IntakeCandidateConfidence,
  IntakePhase,
  IntakeResearchStatus,
  InstructionLanguage,
  IntakeSource,
  IntakeStatus,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Necessity,
  PaymentKind,
  PaymentMethod,
  PaymentStatus,
  PostStatus,
  PrepaymentMode,
  ProgramCandidateConfidence,
  ProgramLevel,
  ProgramSource,
  SchoolInvoiceStatus,
  ServiceType,
  UniversityType,
  UserRole,
  VisaStatus,
  VisaType,
  WorkTaskStatus,
  WorkTaskType,
} from '@gks/shared';

/**
 * What we show instead of a missing value. Never render an unknown number as 0 —
 * dormitory prices and international-student counts are unfilled by design.
 */
export const UNKNOWN_LABEL = 'Мэдээлэл шинэчлэгдэж байна';

/** `DsBadge`'s `tone` prop — status maps below stay in step with the component. */
export type BadgeTone = 'neutral' | 'ink' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

export const UNIVERSITY_TYPE_LABELS: Record<UniversityType, string> = {
  NATIONAL: 'Үндэсний',
  PUBLIC: 'Улсын',
  PRIVATE: 'Хувийн',
};

/**
 * 교육국제화역량 인증제 — the Ministry of Education's certification tier. It is a
 * visa signal, not a quality ranking: an `EXCELLENT` school's students get
 * simplified D-2/D-4 screening, and Seoul National University is `CERTIFIED`.
 */
export const ACCREDITATION_LABELS: Record<AccreditationGrade, string> = {
  EXCELLENT: 'Шилдэг магадлан итгэмжлэгдсэн',
  CERTIFIED: 'Магадлан итгэмжлэгдсэн',
  NONE: 'Магадлан итгэмжлэгдээгүй',
};

/** The short form the catalogue card has room for. */
export const ACCREDITATION_SHORT_LABELS: Record<AccreditationGrade, string> = {
  EXCELLENT: 'Шилдэг итгэмжлэл',
  CERTIFIED: 'Итгэмжлэгдсэн',
  NONE: 'Итгэмжлэлгүй',
};

export const ACCREDITATION_TONES: Record<AccreditationGrade, BadgeTone> = {
  EXCELLENT: 'success',
  CERTIFIED: 'neutral',
  NONE: 'neutral',
};

/** What the tier actually buys a student, for the detail page's one-liner. */
export const ACCREDITATION_NOTES: Record<AccreditationGrade, string> = {
  EXCELLENT: 'Боловсролын яамны шилдэг итгэмжлэлтэй — оюутны визийн шалгалт хялбаршуулсан журмаар явна.',
  CERTIFIED: 'Боловсролын яамны итгэмжлэлтэй — гадаад оюутан хүлээн авах эрхтэй.',
  NONE: 'Боловсролын яамны итгэмжлэлийн жагсаалтад ороогүй.',
};

/** Whether GKS holds an agency agreement with the school (staff-only field). */
export const AGENT_CONTRACT_STATUS_LABELS: Record<AgentContractStatus, string> = {
  NONE: 'Гэрээгүй',
  IN_TALKS: 'Яриа хэлцэлд',
  SIGNED: 'Гэрээтэй',
  EXPIRED: 'Хугацаа дууссан',
};

export const AGENT_CONTRACT_STATUS_TONES: Record<AgentContractStatus, BadgeTone> = {
  NONE: 'neutral',
  IN_TALKS: 'info',
  SIGNED: 'success',
  EXPIRED: 'warning',
};

export const PROGRAM_LEVEL_LABELS: Record<ProgramLevel, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
};

/**
 * The language a programme is taught in — the filter a Mongolian applicant with
 * no TOPIK asks about first.
 */
export const INSTRUCTION_LANGUAGE_LABELS: Record<InstructionLanguage, string> = {
  KOREAN: 'Солонгос хэл',
  ENGLISH: 'Англи хэл',
  KOREAN_ENGLISH: 'Солонгос / англи',
};

export const INSTRUCTION_LANGUAGE_TONE: Record<InstructionLanguage, BadgeTone> = {
  KOREAN: 'neutral',
  ENGLISH: 'info',
  KOREAN_ENGLISH: 'accent',
};

export const PROGRAM_SOURCE_LABELS: Record<ProgramSource, string> = {
  MANUAL: 'Гараар',
  AI_ASSISTED: 'LLM-ээс хянагдсан',
  IMPORTED: 'Импортлосон',
};

/** How far the model would stand behind a researched programme and its price. */
export const PROGRAM_CONFIDENCE_LABELS: Record<ProgramCandidateConfidence, string> = {
  HIGH: 'Өндөр',
  MEDIUM: 'Дунд',
  LOW: 'Бага',
};

export const PROGRAM_CONFIDENCE_TONE: Record<ProgramCandidateConfidence, BadgeTone> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'danger',
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
  GKS_SCHOLARSHIP: 'GKS тэтгэлэг',
};

export const FAQ_CATEGORY_LABELS: Record<FaqCategory, string> = {
  GENERAL: 'Ерөнхий',
  SERVICES: 'Үйлчилгээ',
  PRICING: 'Үнэ, төлбөр',
  DOCUMENTS: 'Материал, бичиг баримт',
  VISA: 'Виз',
  LANGUAGE_CENTER: 'Хэлний сургалтын төв',
};

/** The order the FAQ page and its admin screen list categories in. */
export const FAQ_CATEGORY_ORDER: FaqCategory[] = [
  'GENERAL',
  'SERVICES',
  'PRICING',
  'DOCUMENTS',
  'VISA',
  'LANGUAGE_CENTER',
];

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  DRAFT: 'Ноорог',
  PUBLISHED: 'Нийтлэгдсэн',
};

export const BANNER_PLACEMENT_LABELS: Record<BannerPlacement, string> = {
  SITE_TOP: 'Сайтын дээд туузан зурвас',
  HOME_HERO: 'Нүүр хуудасны карт',
};

/** Staff-facing role names (1G-12); shared by the admin shell and the reports. */
export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Админ',
  CONSULTANT: 'Зөвлөх',
  DOC_OFFICER: 'Баримт хариуцагч',
  USER: 'Хэрэглэгч',
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  SECONDARY_SCHOOL: 'Бүрэн дунд (ЕБС)',
  VOCATIONAL: 'Мэргэжлийн боловсрол',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
};

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  PLANNED: 'Ноорог',
  OPEN: 'Нээлттэй',
  CLOSED: 'Хаагдсан',
  CANCELLED: 'Цуцлагдсан',
};

export const INTAKE_STATUS_TONE: Record<IntakeStatus, BadgeTone> = {
  PLANNED: 'neutral',
  OPEN: 'success',
  CLOSED: 'ink',
  CANCELLED: 'danger',
};

/**
 * Where an intake sits right now — derived from its dates by the API, never
 * stored. There is no "not open yet": we register a client for a published
 * round at any point before our own deadline.
 *
 * `FINAL_CALL` is the one worth reading twice: our deadline has passed but the
 * school still accepts documents, so it is a staff decision rather than a
 * closed door. It never appears on a public list.
 */
export const INTAKE_PHASE_LABELS: Record<IntakePhase, string> = {
  OPEN: 'Нээлттэй',
  FINAL_CALL: 'Сүүлийн боломж',
  CLOSED: 'Хаагдсан',
};

export const INTAKE_PHASE_TONE: Record<IntakePhase, BadgeTone> = {
  OPEN: 'success',
  FINAL_CALL: 'warning',
  CLOSED: 'neutral',
};

export const INTAKE_SOURCE_LABELS: Record<IntakeSource, string> = {
  MANUAL: 'Гараар',
  AI_ASSISTED: 'LLM-ээс хянагдсан',
  IMPORTED: 'Импортлосон',
};

export const RESEARCH_STATUS_LABELS: Record<IntakeResearchStatus, string> = {
  QUEUED: 'Дараалалд',
  RUNNING: 'Судалж байна',
  SUCCEEDED: 'Дууссан',
  FAILED: 'Амжилтгүй',
};

export const RESEARCH_STATUS_TONE: Record<IntakeResearchStatus, BadgeTone> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
};

/** How far the model would stand behind a researched date. */
export const RESEARCH_CONFIDENCE_LABELS: Record<IntakeCandidateConfidence, string> = {
  HIGH: 'Өндөр',
  MEDIUM: 'Дунд',
  LOW: 'Бага',
};

export const RESEARCH_CONFIDENCE_TONE: Record<IntakeCandidateConfidence, BadgeTone> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'danger',
};

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: 'Шинэ',
  CONTACTED: 'Холбогдсон',
  CONSULTED: 'Зөвлөгөө өгсөн',
  PROPOSAL_SENT: 'Санал илгээсэн',
  CONTRACT_PENDING: 'Гэрээ хүлээгдэж буй',
  WON: 'Гэрээ болсон',
  LOST: 'Алдсан',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  WEBSITE: 'Вебсайт',
  AI_CHAT: 'AI чат',
  PHONE: 'Утас',
  SOCIAL: 'Сошиал медиа',
  OFFICE: 'Оффис',
  LANGUAGE_CENTER: 'Хэлний сургалтын төв',
  REFERRAL: 'Танилын зөвлөмж',
  OTHER: 'Бусад',
};

/**
 * Dashboard funnel-bar fill per stage (1B-08). The five active stages read as a
 * sequential brand ramp (deeper into the pipeline = darker); the two outcomes
 * get the app's status colors since they're a result, not a depth.
 */
export const LEAD_STAGE_BAR_COLOR: Record<LeadStage, string> = {
  NEW: 'var(--brand-200)',
  CONTACTED: 'var(--brand-300)',
  CONSULTED: 'var(--brand-400)',
  PROPOSAL_SENT: 'var(--brand-500)',
  CONTRACT_PENDING: 'var(--brand-600)',
  WON: 'var(--green-600)',
  LOST: 'var(--red-700)',
};

export const LEAD_ACTIVITY_TYPE_LABELS: Record<LeadActivityType, string> = {
  NOTE: 'Тэмдэглэл',
  CALL: 'Дуудлага',
  MEETING: 'Уулзалт',
  MESSAGE: 'Мессеж',
  EMAIL: 'И-мэйл',
  CHAT: 'Чат',
  STAGE_CHANGE: 'Үе шат өөрчлөгдсөн',
};

export const CASE_STAGE_LABELS: Record<CaseStage, string> = {
  CONTRACT_DRAFT: 'Гэрээ бэлтгэж буй',
  CONTRACT_SIGNED: 'Гэрээ байгуулсан',
  PREPAYMENT_PAID: 'Урьдчилгаа төлсөн',
  DOCUMENTS: 'Материал бүрдүүлж буй',
  APPLICATION_SUBMITTED: 'Мэдүүлэг илгээсэн',
  ADMITTED: 'Элсэлт авсан',
  TUITION_INVOICED: 'Сургалтын төлбөр нэхэмжилсэн',
  INVITATION_RECEIVED: 'Урилга хүлээн авсан',
  GKS_ROUND1_PASSED: 'Тэтгэлэг 1-р шат нэвтэрсэн',
  GKS_ROUND2_PASSED: 'Тэтгэлэг 2-р шат нэвтэрсэн',
  VISA: 'Виз хүсэлт гаргасан',
  VISA_APPROVED: 'Виз гарсан',
  BALANCE_PAID: 'Үлдэгдэл төлсөн',
  COLLATERAL_CONTRACT: 'Барьцааны гэрээ',
  PRE_DEPARTURE: 'Явахын өмнөх бэлтгэл',
  DEPARTED: 'Явсан',
  COMPLETED: 'Дууссан',
  ON_HOLD: 'Түр зогссон',
  CANCELLED: 'Цуцлагдсан',
  REJECTED: 'Татгалзсан',
};

/**
 * The stages a case sits in before its prepayment is confirmed. The material
 * checklist is what that payment buys, so the screens grey out "build the list"
 * until then — the API refuses it either way (gksedu.md §9).
 */
export const PRE_PREPAYMENT_STAGES: CaseStage[] = ['CONTRACT_DRAFT', 'CONTRACT_SIGNED'];

/**
 * Badge tone per case stage. Every screen that shows a stage reads this map —
 * the same colour must mean the same thing on the list, the workspace and the
 * dashboard (UX: consistent status badges).
 */
export const CASE_STAGE_TONE: Record<CaseStage, BadgeTone> = {
  CONTRACT_DRAFT: 'neutral',
  CONTRACT_SIGNED: 'info',
  PREPAYMENT_PAID: 'info',
  DOCUMENTS: 'info',
  APPLICATION_SUBMITTED: 'info',
  ADMITTED: 'info',
  TUITION_INVOICED: 'info',
  INVITATION_RECEIVED: 'info',
  GKS_ROUND1_PASSED: 'info',
  GKS_ROUND2_PASSED: 'info',
  VISA: 'info',
  VISA_APPROVED: 'info',
  BALANCE_PAID: 'info',
  COLLATERAL_CONTRACT: 'info',
  PRE_DEPARTURE: 'info',
  DEPARTED: 'success',
  COMPLETED: 'success',
  ON_HOLD: 'warning',
  CANCELLED: 'danger',
  REJECTED: 'danger',
};

export const LEAD_STAGE_TONE: Record<LeadStage, BadgeTone> = {
  NEW: 'neutral',
  CONTACTED: 'info',
  CONSULTED: 'info',
  PROPOSAL_SENT: 'info',
  CONTRACT_PENDING: 'info',
  WON: 'success',
  LOST: 'danger',
};

export const CONTRACT_STATUS_TONE: Record<ContractStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  SIGNED: 'info',
  ACTIVE: 'success',
  COMPLETED: 'success',
  TERMINATED: 'danger',
};

export const PAYMENT_STATUS_TONE: Record<PaymentStatus, BadgeTone> = {
  PENDING: 'warning',
  PAID: 'success',
  FAILED: 'danger',
  EXPIRED: 'danger',
  REFUNDED: 'success',
};

export const CLIENT_STATUS_TONE: Record<ClientStatus, BadgeTone> = {
  ACTIVE: 'success',
  INACTIVE: 'neutral',
  ARCHIVED: 'neutral',
};

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ACTIVE: 'Идэвхтэй',
  INACTIVE: 'Идэвхгүй',
  ARCHIVED: 'Архивласан',
};

export const GENDER_LABELS: Record<Gender, string> = {
  MALE: 'Эрэгтэй',
  FEMALE: 'Эмэгтэй',
  OTHER: 'Бусад',
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  ELECTRONIC: 'Цахим гэрээ',
  PHYSICAL: 'Биет гэрээ',
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Ноорог',
  SENT: 'Илгээсэн',
  SIGNED: 'Гарын үсэг зурсан',
  ACTIVE: 'Хүчин төгөлдөр',
  COMPLETED: 'Дууссан',
  TERMINATED: 'Цуцлагдсан',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  PREPAYMENT: 'Урьдчилгаа',
  BALANCE: 'Үлдэгдэл',
  SCHOOL_TUITION: 'Сургалтын төлбөр',
  TRANSFER_FEE: 'Шилжүүлгийн хураамж',
  EXTRA_SERVICE: 'Нэмэлт үйлчилгээ',
  REFUND: 'Буцаалт',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Хүлээгдэж буй',
  PAID: 'Төлөгдсөн',
  FAILED: 'Амжилтгүй',
  EXPIRED: 'Хугацаа дууссан',
  REFUNDED: 'Буцаагдсан',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  QPAY: 'QPay',
  BANK_TRANSFER: 'Дансаар',
  CARD: 'Картаар',
  CASH: 'Бэлэн мөнгө',
};

export const PREPAYMENT_MODE_LABELS: Record<PrepaymentMode, string> = {
  PERCENT: 'Хувиар',
  FIXED: 'Тогтмол дүнгээр',
};

export const BALANCE_TRIGGER_LABELS: Record<BalanceTrigger, string> = {
  AFTER_VISA_APPROVED: 'Виз гарсны дараа',
  AFTER_SCHOLARSHIP_RESULT: 'Тэтгэлэгт тэнцсэний дараа',
};

/** Korean academic intakes: March, June, September, December. */
export const INTAKE_MONTH_LABELS: Record<number, string> = {
  3: '3-р сар (хавар)',
  6: '6-р сар (зун)',
  9: '9-р сар (намар)',
  12: '12-р сар (өвөл)',
};

/**
 * A `<select>`'s options, in the order the label map declares them.
 *
 * `Object.entries` widens its keys back to `string`, so every screen that built
 * a dropdown from a label map wrote the same cast to the enum before mapping —
 * twenty-odd copies of a claim that is really about `Record<K, string>` itself.
 * Made once here, it is also the only place that can get it wrong.
 *
 * `allLabel` prepends the blank row a filter needs ("Бүх төлөв"); a form that
 * must land on one of the values omits it and gets no blank option at all.
 */
export function selectOptions<K extends string>(labels: Record<K, string>): { value: K; label: string }[];
export function selectOptions<K extends string>(
  labels: Record<K, string>,
  allLabel: string,
): { value: K | ''; label: string }[];
export function selectOptions<K extends string>(
  labels: Record<K, string>,
  allLabel?: string,
): { value: K | ''; label: string }[] {
  const options = (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
  return allLabel === undefined ? options : [{ value: '', label: allLabel }, ...options];
}

const numberFormat = new Intl.NumberFormat('mn-MN');

/** Groups digits; returns null so callers can decide how to show "unknown". */
export function formatNumber(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : null;
}

export function formatKrw(value: number | null | undefined): string | null {
  const formatted = formatNumber(value);
  return formatted === null ? null : `₩${formatted}`;
}

/**
 * A semester price as a year's, when the school only published the former.
 *
 * Two semesters is the Korean academic year, and it is stated here rather than
 * in the database on purpose: the columns store what the school published, and
 * a derived figure that got written down is a figure nobody can later question.
 */
export function annualTuitionKrw(program: {
  tuitionPerYearKrw: number | null;
  tuitionPerTermKrw: number | null;
}): number | null {
  if (program.tuitionPerYearKrw !== null) return program.tuitionPerYearKrw;
  return program.tuitionPerTermKrw === null ? null : program.tuitionPerTermKrw * 2;
}

/**
 * The house rule for a price with no year on it.
 *
 * Korean schools republish their fee table every year, so a figure whose
 * `tuitionYear` we do not know is not "current" — it is unknown provenance, and
 * saying so is what stops it being quoted to a family as this year's number.
 */
export function tuitionYearLabel(tuitionYear: number | null | undefined): string {
  return tuitionYear ? `${tuitionYear} оны үнэ` : 'Он тодорхойгүй';
}

/**
 * "₩810,000 – ₩1,270,000"; falls back to whichever end is known.
 *
 * A range whose ends are equal collapses to one figure: "₩3,400,000 – ₩3,400,000"
 * reads as two prices that happen to match rather than as the one price it is.
 */
export function formatKrwRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const from = formatKrw(min);
  const to = formatKrw(max);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to;
}

export function formatMnt(value: number | null | undefined): string | null {
  const formatted = formatNumber(value);
  return formatted === null ? null : `${formatted}₮`;
}

export function formatMntRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const from = formatMnt(min);
  const to = formatMnt(max);
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from ?? to;
}

/**
 * "32 – 45 сая₮" — a first-year budget at the size a family discusses it.
 *
 * Full digits are right in a table of line items and wrong in a headline: eight
 * of them read as a precision this figure does not have, and the range is the
 * honest part of the answer.
 */
export function formatMntMillions(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const round = (value: number) => (value >= 10_000_000 ? Math.round(value / 1e6) : Math.round(value / 1e5) / 10);
  const from = typeof min === 'number' && Number.isFinite(min) ? round(min) : null;
  const to = typeof max === 'number' && Number.isFinite(max) ? round(max) : null;
  if (from !== null && to !== null) return from === to ? `${from} сая ₮` : `${from} – ${to} сая ₮`;
  const only = from ?? to;
  return only === null ? null : `${only} сая ₮`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1D — Материал бүрдүүлэлт
// ─────────────────────────────────────────────────────────────────────────────

export const DOC_STAGE_LABELS: Record<DocStage, string> = {
  ADMISSION: 'Элсэлтийн материал',
  VISA: 'Визний материал',
};

/** gksedu.md §6.2 — the 12 states, in flow order. */
export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  NOT_STARTED: 'Бүрдүүлээгүй',
  IN_PROGRESS: 'Бүрдүүлж байгаа',
  SUBMITTED: 'Илгээсэн',
  UNDER_REVIEW: 'Шалгаж байна',
  NEEDS_FIX: 'Засвар шаардлагатай',
  RESUBMIT_REQUIRED: 'Дахин илгээх',
  ACCEPTED: 'Хүлээн авсан',
  IN_TRANSLATION: 'Орчуулгад орсон',
  TRANSLATED: 'Орчуулсан',
  CERTIFIED: 'Баталгаажуулсан',
  READY: 'Бэлэн болсон',
  SENT_TO_UNIVERSITY: 'Сургуульд илгээсэн',
};

export const DOCUMENT_STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'neutral',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  NEEDS_FIX: 'warning',
  RESUBMIT_REQUIRED: 'danger',
  ACCEPTED: 'success',
  IN_TRANSLATION: 'info',
  TRANSLATED: 'info',
  CERTIFIED: 'info',
  READY: 'success',
  SENT_TO_UNIVERSITY: 'success',
};

export const NECESSITY_LABELS: Record<Necessity, string> = {
  REQUIRED: 'Заавал',
  CONDITIONAL: 'Нөхцөлт',
  OPTIONAL: 'Сонголтоор',
};

export const GUARANTOR_TYPE_LABELS: Record<GuarantorType, string> = {
  NONE: 'Батлан даагчгүй',
  EMPLOYEE: 'Ажилтан',
  COMPANY_DIRECTOR: 'Компанийн захирал',
  SELF_EMPLOYED: 'Хувиараа бизнес эрхлэгч',
};

export const GUARANTOR_RELATION_LABELS: Record<GuarantorRelation, string> = {
  PARENT: 'Эцэг / эх',
  SIBLING: 'Ах / эгч',
  UNCLE_AUNT: 'Авга / нагац',
  OTHER: 'Бусад',
};

export const WORK_TASK_TYPE_LABELS: Record<WorkTaskType, string> = {
  TRANSLATION: 'Орчуулга',
  NOTARISATION: 'Нотариат',
  FORM_FILLING: 'Анкет бөглөх',
  STUDY_PLAN: 'Сургалтын төлөвлөгөө',
  SELF_INTRODUCTION: 'Хувийн танилцуулга',
  SCHOLARSHIP_ESSAY: 'Тэтгэлгийн эсээ',
  COMPLETENESS_CHECK: 'Бүрэн бүтэн байдлын шалгалт',
  FILE_MERGE: 'Файл нэгтгэх',
  FINAL_REVIEW: 'Эцсийн шалгалт',
  OTHER: 'Бусад',
};

export const WORK_TASK_STATUS_LABELS: Record<WorkTaskStatus, string> = {
  TODO: 'Хүлээгдэж буй',
  IN_PROGRESS: 'Хийгдэж байна',
  DONE: 'Дууссан',
  CANCELLED: 'Цуцалсан',
};

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: 'Товлосон',
  COMPLETED: 'Ирсэн',
  CANCELLED: 'Цуцалсан',
  NO_SHOW: 'Ирээгүй',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1E — Мэдүүлэг, сургалтын төлбөр, урилга
// ─────────────────────────────────────────────────────────────────────────────

/** gksedu.md §7 — the 9 application states. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PREPARING: 'Материал бэлтгэж байгаа',
  READY: 'Мэдүүлэхэд бэлэн',
  SUBMITTED: 'Сургуульд илгээсэн',
  UNDER_REVIEW: 'Сургууль хянаж байгаа',
  ADDITIONAL_DOCS_REQUESTED: 'Нэмэлт материал шаардсан',
  INTERVIEW_SCHEDULED: 'Ярилцлага товлосон',
  ACCEPTED: 'Тэнцсэн',
  REJECTED: 'Татгалзсан',
  DEFERRED: 'Хойшлогдсон',
};

export const APPLICATION_STATUS_TONE: Record<ApplicationStatus, BadgeTone> = {
  PREPARING: 'neutral',
  READY: 'info',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  ADDITIONAL_DOCS_REQUESTED: 'warning',
  INTERVIEW_SCHEDULED: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  DEFERRED: 'warning',
};

export const APPLICATION_DECISION_LABELS: Record<ApplicationDecision, string> = {
  PASSED: 'Тэнцсэн',
  FAILED: 'Татгалзсан',
  WAITLISTED: 'Нөөцөд орсон',
  DEFERRED: 'Хойшлогдсон',
};

export const SCHOOL_INVOICE_STATUS_LABELS: Record<SchoolInvoiceStatus, string> = {
  DRAFT: 'Ноорог',
  ISSUED: 'Нэхэмжилсэн',
  PAID: 'Төлсөн',
  CONFIRMED_BY_SCHOOL: 'Сургууль хүлээн авсан',
  CANCELLED: 'Цуцалсан',
};

export const INVOICE_ITEM_KIND_LABELS: Record<InvoiceItemKind, string> = {
  TUITION: 'Сургалтын төлбөр',
  DORMITORY: 'Дотуур байр',
  INSURANCE: 'Даатгал',
  ADMISSION_FEE: 'Элсэлтийн хураамж',
  OTHER: 'Бусад',
};

// ─────────────────────────────────────────────────────────────────────────────
// 1F — Виз ба явахын өмнөх бэлтгэл
// ─────────────────────────────────────────────────────────────────────────────

/** gksedu.md §10 — the 8 visa states. */
export const VISA_STATUS_LABELS: Record<VisaStatus, string> = {
  COLLECTING: 'Материал бүрдүүлж байгаа',
  REVIEWING: 'Материал шалгаж байгаа',
  READY: 'Мэдүүлэхэд бэлэн',
  SUBMITTED: 'Виз мэдүүлсэн',
  ADDITIONAL_DOCS_REQUESTED: 'Нэмэлт материал шаардсан',
  APPROVED: 'Виз гарсан',
  REJECTED: 'Виз татгалзсан',
  REAPPLY: 'Дахин мэдүүлэхээр болсон',
};

export const VISA_STATUS_TONE: Record<VisaStatus, BadgeTone> = {
  COLLECTING: 'neutral',
  REVIEWING: 'info',
  READY: 'info',
  SUBMITTED: 'info',
  ADDITIONAL_DOCS_REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REAPPLY: 'warning',
};

export const VISA_TYPE_LABELS: Record<VisaType, string> = {
  D2: 'D-2 (үндсэн анги)',
  D4: 'D-4 (хэлний бэлтгэл)',
  OTHER: 'Бусад',
};

/** "₩1,270,000" formatted from the API's decimal-as-string payloads. */
export function formatKrwAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return formatKrw(Number(value));
}

export function formatMntAmount(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return formatMnt(Number(value));
}

/**
 * The same figure, already given up on: `'—'` where there is no amount.
 *
 * The `format*` family returns `null` so a caller can decide how to say
 * "unknown" — a card shows {@link UNKNOWN_LABEL}, a table shows a dash. Six
 * screens had each written that dash out as their own one-line `mnt()`, which
 * is the decision being made six times rather than a decision at all.
 */
export function formatMntOrDash(value: string | number | null | undefined): string {
  return formatMntAmount(value) ?? '—';
}
