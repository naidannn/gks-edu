import type { AppointmentStatus } from './documents';

/** 1B-30 — how a consultation happens. */
export type ConsultationMode = 'OFFICE' | 'PHONE' | 'ONLINE';

/** One booked consultation, as the calendar draws it. */
export interface ConsultationAppointment {
  id: string;
  startsAt: string;
  durationMinutes: number;
  /** A day agreed without an hour: the person comes any time the office is open. */
  allDay: boolean;
  mode: ConsultationMode;
  status: AppointmentStatus;
  name: string;
  phone: string | null;
  note: string | null;
  leadId: string | null;
  clientId: string | null;
  staffId: string | null;
  staff: { id: string; name: string | null; email: string | null } | null;
  /** Null when the assistant booked it. */
  createdBy: { id: string; name: string | null } | null;
  client: { id: string; code: string } | null;
  createdAt: string;
}

/** A client's office visit to hand over originals (1D-11), shown read-only beside consultations. */
export interface CalendarOfficeVisit {
  id: string;
  scheduledAt: string;
  status: AppointmentStatus;
  note: string | null;
  caseId: string;
  caseCode: string;
  name: string | null;
  phone: string | null;
}

/** `0` is Sunday; `null` is a day off. Hours are whole, Ulaanbaatar time. */
export type OfficeWeekHours = Record<number, [number, number] | null>;

export interface ConsultationCalendar {
  hours: OfficeWeekHours;
  appointments: ConsultationAppointment[];
  officeVisits: CalendarOfficeVisit[];
}

export interface ConsultationAppointmentInput {
  startsAt: string;
  durationMinutes?: number;
  mode?: ConsultationMode;
  name: string;
  phone?: string | null;
  note?: string | null;
  leadId?: string | null;
  clientId?: string | null;
  staffId?: string | null;
}

export interface ConsultationAppointmentUpdate extends Partial<ConsultationAppointmentInput> {
  status?: AppointmentStatus;
  allDay?: boolean;
}
