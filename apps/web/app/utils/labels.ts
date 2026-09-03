/**
 * Mongolian labels for database enums, and the house rules for formatting
 * numbers the dataset may not know.
 *
 * Enum values stay English SCREAMING_SNAKE in the database; every screen reads
 * its label from here so a wording change lands in one place (CLAUDE.md).
 */
import type {
  EducationLevel,
  IntakeStatus,
  ProgramLevel,
  ServiceType,
  UniversityType,
} from '@gks/shared';

/**
 * What we show instead of a missing value. Never render an unknown number as 0 —
 * dormitory prices and international-student counts are unfilled by design.
 */
export const UNKNOWN_LABEL = 'Мэдээлэл шинэчлэгдэж байна';

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
