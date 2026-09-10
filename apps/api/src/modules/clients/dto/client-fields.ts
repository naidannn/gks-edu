import { Transform } from 'class-transformer';

/**
 * The phone pattern and its transform live in `common/validation/transforms`
 * now — they are the same rule for a lead, a client and a portal profile — and
 * are re-exported here so the client and `me` DTOs keep one import.
 */
export { PHONE_PATTERN, TransformPhone, stripPhoneFormatting } from '../../../common/validation/transforms.js';

/**
 * Регистрийн дугаар — two Cyrillic letters then eight digits (УБ12345678).
 * `Ө`, `Ү` and `Ё` sit outside the contiguous А–Я block, so they are listed.
 */
export const REGISTER_PATTERN = /^[А-ЯӨҮЁ]{2}\d{8}$/;

export const normalizeRegister = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/\s/g, '').toUpperCase() : value;

export const TransformRegister = () => Transform(normalizeRegister);

/** Age in whole years on `on` — the contract date, not today. */
export function ageOn(birthDate: Date, on: Date = new Date()): number {
  let age = on.getFullYear() - birthDate.getFullYear();
  const monthDelta = on.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

/** Mongolian legal majority — below this a guardian must co-sign (§6.2). */
export const ADULT_AGE = 18;
