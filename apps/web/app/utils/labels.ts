/**
 * Mongolian labels for database enums, and the house rules for formatting
 * numbers the dataset may not know.
 *
 * Enum values stay English SCREAMING_SNAKE in the database; every screen reads
 * its label from here so a wording change lands in one place (CLAUDE.md).
 */
import type {
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
  Gender,
  GuarantorRelation,
  GuarantorType,
  InvoiceItemKind,
  IntakeStatus,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Necessity,
  PaymentKind,
  PaymentStatus,
  PrepaymentMode,
  ProgramLevel,
  SchoolInvoiceStatus,
  ServiceType,
  UniversityType,
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

export const PROGRAM_LEVEL_LABELS: Record<ProgramLevel, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
};

export const SERVICE_LABELS: Record<ServiceType, string> = {
  LANGUAGE_PREP: 'Хэлний бэлтгэл',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
  GKS_SCHOLARSHIP: 'GKS тэтгэлэг',
};

export const EDUCATION_LEVEL_LABELS: Record<EducationLevel, string> = {
  SECONDARY_SCHOOL: 'Бүрэн дунд (ЕБС)',
  VOCATIONAL: 'Мэргэжлийн боловсрол',
  BACHELOR: 'Бакалавр',
  MASTER: 'Магистр',
  PHD: 'Доктор',
};

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  PLANNED: 'Төлөвлөгдсөн',
  OPEN: 'Нээлттэй',
  CLOSED: 'Хаагдсан',
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

const numberFormat = new Intl.NumberFormat('mn-MN');

/** Groups digits; returns null so callers can decide how to show "unknown". */
export function formatNumber(value: number | null | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? numberFormat.format(value) : null;
}

export function formatKrw(value: number | null | undefined): string | null {
  const formatted = formatNumber(value);
  return formatted === null ? null : `₩${formatted}`;
}

/** "₩810,000 – ₩1,270,000"; falls back to whichever end is known. */
export function formatKrwRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const from = formatKrw(min);
  const to = formatKrw(max);
  if (from && to) return `${from} – ${to}`;
  return from ?? to;
}

export function formatMnt(value: number | null | undefined): string | null {
  const formatted = formatNumber(value);
  return formatted === null ? null : `${formatted}₮`;
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
