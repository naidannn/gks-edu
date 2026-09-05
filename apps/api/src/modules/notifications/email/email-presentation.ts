import { NotificationEvent } from '../../../prisma/client.js';
import type { EmailTone } from './email-brand.js';

/**
 * How each event presents itself in the inbox: which stage of the journey the
 * badge names, what colour the accent stripe takes, and what the button says.
 *
 * This lives in code rather than in `NotificationTemplate` on purpose. The
 * wording admins edit is the message; the badge and the button label are part
 * of the layout, and a mistyped colour or an empty button label would break
 * every email of that event with no way to see it from the admin screen.
 */
export interface EventPresentation {
  eyebrow: string;
  tone: EmailTone;
  ctaLabel: string;
}

const DETAILS = 'Дэлгэрэнгүй харах';
const CABINET = 'Кабинет руу орох';

export const EVENT_PRESENTATION: Record<NotificationEvent, EventPresentation> = {
  [NotificationEvent.ACCOUNT_CREATED]: {
    eyebrow: 'Тавтай морил',
    tone: 'success',
    ctaLabel: 'Кабинетаа нээх',
  },

  // Материал (§6)
  [NotificationEvent.DOCUMENT_DEADLINE_NEAR]: {
    eyebrow: 'Материал',
    tone: 'warning',
    ctaLabel: 'Материал илгээх',
  },
  [NotificationEvent.DOCUMENT_MISSING]: {
    eyebrow: 'Материал',
    tone: 'warning',
    ctaLabel: 'Дутуу материал нөхөх',
  },
  [NotificationEvent.DOCUMENT_REJECTED]: {
    eyebrow: 'Материал',
    tone: 'critical',
    ctaLabel: 'Дахин илгээх',
  },
  [NotificationEvent.DOCUMENT_FIX_REQUIRED]: {
    eyebrow: 'Материал',
    tone: 'warning',
    ctaLabel: 'Засаад илгээх',
  },
  [NotificationEvent.DOCUMENT_APPROVED]: {
    eyebrow: 'Материал',
    tone: 'success',
    ctaLabel: 'Материалын жагсаалт',
  },

  // Гэрээ ба төлбөр (§5)
  [NotificationEvent.CONTRACT_CONFIRMED]: {
    eyebrow: 'Гэрээ',
    tone: 'success',
    ctaLabel: 'Гэрээгээ харах',
  },
  [NotificationEvent.PAYMENT_DUE]: {
    eyebrow: 'Төлбөр',
    tone: 'warning',
    ctaLabel: 'QPay-ээр төлөх',
  },
  [NotificationEvent.PAYMENT_CONFIRMED]: {
    eyebrow: 'Төлбөр',
    tone: 'success',
    ctaLabel: 'Төлбөрийн түүх',
  },

  // Мэдүүлэг (§7)
  [NotificationEvent.APPLICATION_RESULT]: { eyebrow: 'Мэдүүлэг', tone: 'info', ctaLabel: DETAILS },
  [NotificationEvent.APPLICATION_EXTRA_DOCS]: {
    eyebrow: 'Мэдүүлэг',
    tone: 'warning',
    ctaLabel: 'Нэмэлт материал илгээх',
  },
  [NotificationEvent.INVITATION_RECEIVED]: {
    eyebrow: 'Урилга',
    tone: 'success',
    ctaLabel: 'Урилгаа харах',
  },

  // Виз (§8)
  [NotificationEvent.VISA_STAGE_STARTED]: { eyebrow: 'Виз', tone: 'info', ctaLabel: 'Визний хэсэг рүү' },
  [NotificationEvent.VISA_APPOINTMENT_DUE]: {
    eyebrow: 'Виз',
    tone: 'warning',
    ctaLabel: 'Бэлтгэлээ шалгах',
  },
  [NotificationEvent.VISA_RESULT]: { eyebrow: 'Виз', tone: 'info', ctaLabel: DETAILS },
  [NotificationEvent.VISA_RENEWAL_NEAR]: { eyebrow: 'Виз', tone: 'warning', ctaLabel: DETAILS },

  // Явах бэлтгэл (§10)
  [NotificationEvent.DEPARTURE_NEAR]: {
    eyebrow: 'Явах бэлтгэл',
    tone: 'warning',
    ctaLabel: 'Бэлтгэлийн жагсаалт',
  },
  [NotificationEvent.FLIGHT_INFO_UPDATED]: {
    eyebrow: 'Явах бэлтгэл',
    tone: 'info',
    ctaLabel: 'Нислэгийн мэдээлэл',
  },

  // Элсэлтийн хуанли — the intake calendar's events. Their copy is owned by
  // the admissions module; what belongs here is only how they look.
  [NotificationEvent.INTAKE_DEADLINE_NEAR]: {
    eyebrow: 'Элсэлт',
    tone: 'warning',
    ctaLabel: 'Хэргээ харах',
  },
  [NotificationEvent.INTAKE_OPENED]: {
    eyebrow: 'Элсэлт',
    tone: 'info',
    ctaLabel: 'Сургуулийг харах',
  },
  [NotificationEvent.INTAKE_CASE_AT_RISK]: {
    eyebrow: 'Анхаар',
    tone: 'critical',
    ctaLabel: 'CRM дээр нээх',
  },

  // Ажилтны талын мэдэгдэл
  [NotificationEvent.LEAD_CREATED]: { eyebrow: 'Шинэ сэжим', tone: 'info', ctaLabel: 'CRM дээр нээх' },
  [NotificationEvent.LEAD_FOLLOW_UP_DUE]: {
    eyebrow: 'Сэжим',
    tone: 'warning',
    ctaLabel: 'CRM дээр нээх',
  },
};

export const DEFAULT_PRESENTATION: EventPresentation = {
  eyebrow: 'Мэдэгдэл',
  tone: 'info',
  ctaLabel: CABINET,
};

/**
 * A result event is good news or bad news depending on the decision, so the
 * dispatcher may pass `tone` in the notification context to override the
 * static one. Anything unrecognised falls back rather than throwing — the
 * value comes from a JSON column.
 */
export function presentationFor(event: NotificationEvent, override?: unknown): EventPresentation {
  const base = EVENT_PRESENTATION[event] ?? DEFAULT_PRESENTATION;
  const tone = override as EmailTone;
  return tone === 'info' || tone === 'success' || tone === 'warning' || tone === 'critical'
    ? { ...base, tone }
    : base;
}
