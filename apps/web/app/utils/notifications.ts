import type { NotificationChannel, NotificationEvent } from '@gks/shared';

/**
 * Mongolian labels and icons for the §16 notification catalogue (1G-05/1G-06).
 * Enum values stay English in the database; every screen reads its wording
 * from here (CLAUDE.md).
 */

export const NOTIFICATION_EVENT_LABELS: Record<NotificationEvent, string> = {
  DOCUMENT_DEADLINE_NEAR: 'Материалын хугацаа дөхсөн',
  DOCUMENT_MISSING: 'Материал дутуу',
  DOCUMENT_REJECTED: 'Материал буцаагдсан',
  DOCUMENT_FIX_REQUIRED: 'Засвар шаардлагатай',
  CONTRACT_CONFIRMED: 'Гэрээ баталгаажсан',
  PAYMENT_DUE: 'Төлбөрийн хугацаа болсон',
  PAYMENT_CONFIRMED: 'Төлбөр баталгаажсан',
  APPLICATION_RESULT: 'Сургуулийн хариу ирсэн',
  APPLICATION_EXTRA_DOCS: 'Нэмэлт материал шаардсан',
  INVITATION_RECEIVED: 'Урилга ирсэн',
  VISA_STAGE_STARTED: 'Визний үе шат эхэлсэн',
  VISA_APPOINTMENT_DUE: 'Виз мэдүүлэх өдөр болсон',
  VISA_RESULT: 'Визний хариу бүртгэгдсэн',
  VISA_RENEWAL_NEAR: 'Виз сунгах хугацаа дөхсөн',
  DEPARTURE_NEAR: 'Явах өдөр дөхсөн',
  FLIGHT_INFO_UPDATED: 'Онгоцны мэдээлэл шинэчлэгдсэн',
  LEAD_CREATED: 'Шинэ сэжим ирсэн',
  LEAD_FOLLOW_UP_DUE: 'Холбогдох өдөр болсон',
};

export const NOTIFICATION_EVENT_ICONS: Record<NotificationEvent, string> = {
  DOCUMENT_DEADLINE_NEAR: 'clock',
  DOCUMENT_MISSING: 'file-warning',
  DOCUMENT_REJECTED: 'file-x-2',
  DOCUMENT_FIX_REQUIRED: 'file-pen',
  CONTRACT_CONFIRMED: 'file-check-2',
  PAYMENT_DUE: 'credit-card',
  PAYMENT_CONFIRMED: 'circle-check',
  APPLICATION_RESULT: 'graduation-cap',
  APPLICATION_EXTRA_DOCS: 'file-plus-2',
  INVITATION_RECEIVED: 'mail-check',
  VISA_STAGE_STARTED: 'plane',
  VISA_APPOINTMENT_DUE: 'calendar-clock',
  VISA_RESULT: 'stamp',
  VISA_RENEWAL_NEAR: 'calendar-sync',
  DEPARTURE_NEAR: 'luggage',
  FLIGHT_INFO_UPDATED: 'ticket',
  LEAD_CREATED: 'user-plus',
  LEAD_FOLLOW_UP_DUE: 'phone-call',
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'Систем дотор',
  EMAIL: 'Имэйл',
  SMS: 'SMS',
  PUSH: 'Push',
};

/** Which §16 group an event belongs to — the template admin screen groups by this. */
export const NOTIFICATION_EVENT_GROUPS: { title: string; events: NotificationEvent[] }[] = [
  {
    title: 'Материал',
    events: ['DOCUMENT_DEADLINE_NEAR', 'DOCUMENT_MISSING', 'DOCUMENT_REJECTED', 'DOCUMENT_FIX_REQUIRED'],
  },
  { title: 'Гэрээ ба төлбөр', events: ['CONTRACT_CONFIRMED', 'PAYMENT_DUE', 'PAYMENT_CONFIRMED'] },
  { title: 'Мэдүүлэг', events: ['APPLICATION_RESULT', 'APPLICATION_EXTRA_DOCS', 'INVITATION_RECEIVED'] },
  { title: 'Виз', events: ['VISA_STAGE_STARTED', 'VISA_APPOINTMENT_DUE', 'VISA_RESULT', 'VISA_RENEWAL_NEAR'] },
  { title: 'Явах бэлтгэл', events: ['DEPARTURE_NEAR', 'FLIGHT_INFO_UPDATED'] },
  { title: 'Ажилтны мэдэгдэл', events: ['LEAD_CREATED', 'LEAD_FOLLOW_UP_DUE'] },
];

/** "5 минутын өмнө" / "3 хоногийн өмнө" — short enough for a dropdown row. */
export function formatRelativeMn(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Дөнгөж сая';
  if (minutes < 60) return `${minutes} минутын өмнө`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} цагийн өмнө`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} хоногийн өмнө`;

  return new Date(iso).toLocaleDateString('mn-MN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
