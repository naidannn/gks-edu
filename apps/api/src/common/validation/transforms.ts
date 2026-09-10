import { Transform } from 'class-transformer';

/**
 * The transforms a DTO applies before validation, in one place.
 *
 * Both of these were copied field by field across the lead, client, staff and
 * profile DTOs, and a copy that drifted is how the same person ends up stored
 * twice — once as `Bat@Gmail.com` and once as `bat@gmail.com`, or once as
 * `+976 9911-2233` and once as `99112233`.
 */

/** Mongolian mobile numbers: 8 digits, optionally 976-prefixed. */
export const PHONE_PATTERN = /^(976)?\d{8}$/;

/** People type "9911-2233", "+976 9911 2233" … — compare digits, not formatting. */
export const stripPhoneFormatting = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s()+-]/g, '') : value;

/**
 * An address is a case-insensitive identity but a case-sensitive column, so it
 * is folded here — once, on the way in — rather than in whichever service
 * happened to remember. An address pasted out of a chat also arrives padded,
 * and `@IsEmail` rejects that.
 */
export const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export const TransformPhone = () => Transform(stripPhoneFormatting);
export const TransformEmail = () => Transform(normalizeEmail);

/**
 * An assignee filter: a real id, or the word the CRM lists use for "nobody".
 *
 * `@IsString()` alone let a typo through to a `uuid` column, where Prisma's
 * P2023 surfaced as a 500 rather than "энэ утга буруу байна".
 */
export const UUID_OR_UNASSIGNED =
  /^(unassigned|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
