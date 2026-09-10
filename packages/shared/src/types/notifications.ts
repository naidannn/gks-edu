/**
 * Notification payloads — 1G-01…1G-07. Reporting moved to `./reports`.
 *
 * The enums mirror the Prisma ones; keeping them as string unions here means
 * the web app never imports the generated Prisma client.
 */

export type NotificationEvent =
  | 'DOCUMENT_DEADLINE_NEAR'
  | 'DOCUMENT_MISSING'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_FIX_REQUIRED'
  | 'CONTRACT_CONFIRMED'
  | 'PAYMENT_DUE'
  | 'PAYMENT_CONFIRMED'
  | 'APPLICATION_RESULT'
  | 'APPLICATION_EXTRA_DOCS'
  | 'INVITATION_RECEIVED'
  | 'VISA_STAGE_STARTED'
  | 'VISA_APPOINTMENT_DUE'
  | 'VISA_RESULT'
  | 'VISA_RENEWAL_NEAR'
  | 'DEPARTURE_NEAR'
  | 'FLIGHT_INFO_UPDATED'
  | 'LEAD_CREATED'
  | 'LEAD_FOLLOW_UP_DUE'
  | 'SUPPORT_REPLY';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface NotificationItem {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  title: string;
  body: string;
  link: string | null;
  caseId: string | null;
  leadId: string | null;
  status: NotificationStatus;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unread: number;
}

export interface NotificationPreference {
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationTemplateItem {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  titleMn: string;
  bodyMn: string;
  linkMn: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface SmsUsage {
  date: string;
  sent: number;
  failed: number;
  dailyLimit: number;
  perUserLimit: number;
}
