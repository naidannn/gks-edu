import { NO_DATE } from './date';
import { DEADLINE_SOON_DAYS, DEADLINE_URGENT_DAYS } from './labels';

export type AdmissionStatus = 'OPEN' | 'CLOSING_SOON' | 'URGENT';

export interface AdmissionCountdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
}

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getAdmissionCountdown(deadline: string, now: number): AdmissionCountdown {
  const totalMs = Math.max(new Date(deadline).getTime() - now, 0);
  const days = Math.floor(totalMs / DAY_IN_MS);
  const hours = Math.floor((totalMs % DAY_IN_MS) / (60 * 60 * 1000));
  const minutes = Math.floor((totalMs % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((totalMs % (60 * 1000)) / 1000);

  return { days, hours, minutes, seconds, totalMs };
}

/** The same two thresholds every other deadline badge uses (`utils/labels.ts`). */
export function getAdmissionStatus(daysRemaining: number): AdmissionStatus {
  if (daysRemaining <= DEADLINE_URGENT_DAYS) return 'URGENT';
  if (daysRemaining <= DEADLINE_SOON_DAYS) return 'CLOSING_SOON';
  return 'OPEN';
}

export function getAdmissionProgress(startAt: string, deadline: string, now: number): number {
  const start = new Date(startAt).getTime();
  const end = new Date(deadline).getTime();
  if (end <= start) return 100;

  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

/**
 * `09/05` — an intake date, read in UTC.
 *
 * Intake dates are stamped at the end of their day in UTC, so reading them with
 * the local getters shows the next day in Ulaanbaatar (+08) — the expensive
 * direction for a deadline (`utils/date.ts`).
 */
export function formatAdmissionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return NO_DATE;
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
}
