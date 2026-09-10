import {
  ApplicationDecision,
  LeadSource,
  LeadStage,
  PaymentKind,
  PaymentMethod,
  ServiceType,
  VisaStatus,
  VisaType,
} from '../../prisma/client.js';

/**
 * Mongolian labels for the enum values that reach notification bodies.
 *
 * The frontend keeps its own label map (CLAUDE.md: "their Mongolian labels
 * live in one place on the frontend") — but an email leaves the browser, so
 * the server has to be able to name a `PaymentKind` on its own.
 */

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  [ServiceType.LANGUAGE_PREP]: 'Хэлний бэлтгэл',
  [ServiceType.BACHELOR]: 'Бакалавр',
  [ServiceType.MASTER]: 'Магистр',
  [ServiceType.PHD]: 'Доктор',
  [ServiceType.GKS_SCHOLARSHIP]: 'GKS тэтгэлэг',
};

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  [PaymentKind.PREPAYMENT]: 'Урьдчилгаа төлбөр',
  [PaymentKind.BALANCE]: 'Үлдэгдэл төлбөр',
  [PaymentKind.SCHOOL_TUITION]: 'Сургалтын төлбөр',
  [PaymentKind.TRANSFER_FEE]: 'Шилжүүлгийн шимтгэл',
  [PaymentKind.EXTRA_SERVICE]: 'Нэмэлт үйлчилгээний төлбөр',
  [PaymentKind.REFUND]: 'Буцаалт',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.QPAY]: 'QPay',
  [PaymentMethod.BANK_TRANSFER]: 'Дансаар',
  [PaymentMethod.CARD]: 'Картаар',
  [PaymentMethod.CASH]: 'Бэлэн мөнгө',
};

export const APPLICATION_DECISION_LABELS: Record<ApplicationDecision, string> = {
  [ApplicationDecision.PASSED]: 'Тэнцсэн',
  [ApplicationDecision.FAILED]: 'Тэнцээгүй',
  [ApplicationDecision.WAITLISTED]: 'Хүлээлгийн жагсаалтад',
  [ApplicationDecision.DEFERRED]: 'Хойшлуулсан',
};

export const VISA_STATUS_LABELS: Record<VisaStatus, string> = {
  [VisaStatus.COLLECTING]: 'Материал бүрдүүлж байна',
  [VisaStatus.REVIEWING]: 'Хянагдаж байна',
  [VisaStatus.READY]: 'Мэдүүлэхэд бэлэн',
  [VisaStatus.SUBMITTED]: 'Мэдүүлсэн',
  [VisaStatus.ADDITIONAL_DOCS_REQUESTED]: 'Нэмэлт материал шаардсан',
  [VisaStatus.APPROVED]: 'Виз гарсан',
  [VisaStatus.REJECTED]: 'Татгалзсан',
  [VisaStatus.REAPPLY]: 'Дахин мэдүүлэх',
};

export const VISA_TYPE_LABELS: Record<VisaType, string> = {
  [VisaType.D2]: 'D-2 (оюутны)',
  [VisaType.D4]: 'D-4 (хэлний бэлтгэлийн)',
  [VisaType.OTHER]: 'Бусад',
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  [LeadSource.WEBSITE]: 'Вэбсайт',
  [LeadSource.AI_CHAT]: 'AI чат',
  [LeadSource.PHONE]: 'Утас',
  [LeadSource.SOCIAL]: 'Сошиал сүлжээ',
  [LeadSource.OFFICE]: 'Оффист ирсэн',
  [LeadSource.LANGUAGE_CENTER]: 'Хэлний сургалтын төв',
  [LeadSource.REFERRAL]: 'Санал болголт',
  [LeadSource.OTHER]: 'Бусад',
};

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  [LeadStage.NEW]: 'Шинэ',
  [LeadStage.CONTACTED]: 'Холбогдсон',
  [LeadStage.CONSULTED]: 'Зөвлөгөө өгсөн',
  [LeadStage.PROPOSAL_SENT]: 'Санал тавьсан',
  [LeadStage.CONTRACT_PENDING]: 'Гэрээ хүлээгдэж байна',
  [LeadStage.WON]: 'Гэрээ байгуулсан',
  [LeadStage.LOST]: 'Алдсан',
};

/** One day in milliseconds — the unit every reminder ladder counts in. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight — the lower bound of a "from today onwards" window. */
export function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * `2026-09-05` in the form the templates read: `2026 оны 09 сарын 05`.
 *
 * Read in UTC on purpose. Intake internal deadlines and payment due dates are
 * stored at end of day UTC, so local getters roll them into the next day under
 * any `TZ` east of UTC — a dev machine, or a pm2 `TZ` — and a deadline printed
 * a day late is the expensive direction of that mistake. This is the single
 * implementation: the checklist PDF renders the same dates through it.
 */
export function formatDateMn(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy} оны ${mm} сарын ${dd}`;
}

/**
 * `1200000` → `1,200,000`. Null stays an em dash rather than becoming a
 * confident `0` — an SMS that says "0₮ төлнө үү" is worse than one that says
 * nothing (CLAUDE.md, university reference data rule).
 */
export function formatAmountMn(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const num = typeof value === 'number' ? value : Number(String(value));
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 0 }).format(num);
}
