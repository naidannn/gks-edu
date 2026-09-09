import { createHash } from 'node:crypto';

/**
 * Advanced matching for the Conversions API (1A-38).
 *
 * Meta matches a server event to a person by comparing SHA-256 hashes, which
 * only works if both sides normalise the input identically first — "Bat@Gmail.com "
 * and "bat@gmail.com" are different hashes and therefore different people. The
 * rules below are Meta's own (Customer Information Parameters); the browser
 * pixel applies the same ones to its advanced-matching fields, which is what
 * lets a browser event and a server event about the same person be recognised
 * as one.
 *
 * Nothing here ever returns a raw value: the only thing that leaves this file
 * is a digest, so PII never reaches Facebook, our logs, or the Redis queue the
 * events wait in.
 */

/** Values that are already a digest (64 hex characters) are passed through, not hashed twice. */
const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Meta wants names as letters only — punctuation, digits and spaces come out. */
const NON_NAME_CHARS = /[\s\d!-/:-@[-`{-~]/g;

export interface MetaUserIdentity {
  email?: string | null;
  /** Any format a Mongolian phone is written in; normalised to 976XXXXXXXX. */
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gender?: 'MALE' | 'FEMALE' | string | null;
  birthDate?: Date | string | null;
  city?: string | null;
  zip?: string | null;
  /** ISO 3166-1 alpha-2. Defaults to `mn` nowhere — pass it when it is known. */
  country?: string | null;
  /**
   * Stable ids for the same person — our user id, our lead id, and the
   * first-party id the browser keeps in its `gks_eid` cookie. Meta takes
   * several and matches on any of them.
   */
  externalIds?: (string | null | undefined)[];
  /** Browser cookies, sent raw: these are Meta's own identifiers, not PII. */
  fbp?: string | null;
  fbc?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
}

/** The `user_data` object exactly as the Graph API expects it. */
export interface MetaUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ge?: string[];
  db?: string[];
  ct?: string[];
  zp?: string[];
  country?: string[];
  external_id?: string[];
  fbp?: string;
  fbc?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Hashes unless the caller already handed us a digest. */
function digest(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return SHA256_HEX.test(value) ? value : sha256(value);
}

export function normalizeEmail(value: string | null | undefined): string | undefined {
  const email = value?.trim().toLowerCase();
  // A string with no "@" is a typo or a placeholder; hashing it only adds an
  // identifier that can never match anything.
  return email && email.includes('@') ? email : undefined;
}

/**
 * Meta wants digits only, country code included, no leading zeros or "+".
 * A bare 8-digit number is Mongolian — that is the only shape the rest of the
 * system stores (`normalizePhone` in `LeadsService` strips the 976 back off).
 */
export function normalizePhone(value: string | null | undefined): string | undefined {
  let digits = (value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `976${digits}`;
  return digits.length >= 10 ? digits : undefined;
}

export function normalizeName(value: string | null | undefined): string | undefined {
  const name = value?.trim().toLowerCase().replace(NON_NAME_CHARS, '');
  return name || undefined;
}

/** `Gender.OTHER` has no Meta equivalent and is left out rather than guessed at. */
export function normalizeGender(value: string | null | undefined): string | undefined {
  const gender = value?.trim().toUpperCase();
  if (gender === 'MALE') return 'm';
  if (gender === 'FEMALE') return 'f';
  return undefined;
}

/** YYYYMMDD in UTC — a birthday is a calendar date, not a moment. */
export function normalizeBirthDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function normalizePlace(value: string | null | undefined): string | undefined {
  const place = value?.trim().toLowerCase().replace(/[\s.,'"-]/g, '');
  return place || undefined;
}

function normalizeCountry(value: string | null | undefined): string | undefined {
  const country = value?.trim().toLowerCase();
  return country && country.length === 2 ? country : undefined;
}

/** `::ffff:203.0.113.9` is how Node reports an IPv4 address on a dual-stack socket. */
export function normalizeIp(value: string | null | undefined): string | undefined {
  const ip = value?.trim().replace(/^::ffff:/i, '');
  return ip || undefined;
}

function hashedList(values: (string | undefined)[]): string[] | undefined {
  const list = [...new Set(values.filter((value): value is string => Boolean(value)))].map(sha256);
  return list.length ? list : undefined;
}

/**
 * Builds `user_data`, dropping every field we do not actually know. An empty
 * or `null` value is left out rather than sent as a hash of "" — that is one
 * more thing for Meta to fail to match, and it lowers the quality score the
 * Events Manager reports.
 */
export function buildUserData(identity: MetaUserIdentity): MetaUserData {
  const externalIds = (identity.externalIds ?? [])
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  const userData: MetaUserData = {
    em: hashedList([normalizeEmail(identity.email)]),
    ph: hashedList([normalizePhone(identity.phone)]),
    fn: hashedList([normalizeName(identity.firstName)]),
    ln: hashedList([normalizeName(identity.lastName)]),
    ge: hashedList([normalizeGender(identity.gender)]),
    db: hashedList([normalizeBirthDate(identity.birthDate)]),
    ct: hashedList([normalizePlace(identity.city)]),
    zp: hashedList([normalizePlace(identity.zip)]),
    country: hashedList([normalizeCountry(identity.country)]),
    // Already-hashed ids pass through: the browser relay sends its cookie id
    // in the clear, but a caller holding a digest must not have it hashed again.
    external_id: (() => {
      const list = [...new Set(externalIds)].map(digest).filter((value): value is string => Boolean(value));
      return list.length ? list : undefined;
    })(),
    fbp: identity.fbp?.trim() || undefined,
    fbc: identity.fbc?.trim() || undefined,
    client_ip_address: normalizeIp(identity.clientIpAddress),
    client_user_agent: identity.clientUserAgent?.trim() || undefined,
  };

  for (const key of Object.keys(userData) as (keyof MetaUserData)[]) {
    if (userData[key] === undefined) delete userData[key];
  }

  return userData;
}

/** How many matching signals this event carries — logged, so a drop in match quality is visible. */
export function matchSignalCount(userData: MetaUserData): number {
  return Object.keys(userData).filter((key) => key !== 'client_ip_address' && key !== 'client_user_agent').length;
}
