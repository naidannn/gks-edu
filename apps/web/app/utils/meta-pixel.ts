/**
 * The cookie side of the Meta pixel (1A-38).
 *
 * Three identifiers decide whether a conversion can be attributed to the ad
 * that produced it:
 *
 * - `_fbc` — the click. Meta writes it when someone arrives with `?fbclid=` in
 *   the URL, and it is the single strongest signal there is: it names the ad.
 * - `_fbp` — the browser. A first-party id that ties this visitor's events
 *   together across a session and across days.
 * - `gks_eid` — ours. The same job as `_fbp`, except that an ad blocker cannot
 *   remove it, because nothing about it says "Facebook". It travels to the
 *   Conversions API as `external_id`.
 *
 * The first two are normally written by `fbevents.js`, which for a sizeable
 * share of visitors never loads — a blocker, a strict browser mode, a slow
 * network the person left before. So they are written here too, in Meta's own
 * format, whenever they are missing: the server-side event then still carries a
 * click, and the campaign still learns something. `fbevents.js` looks for an
 * existing cookie before creating one, so when it does load it adopts these
 * rather than adding a second set.
 *
 * Cookies are written host-only (no `domain` attribute) on purpose. Deriving
 * the registrable domain in the browser is guesswork — `.edu.mn` is a public
 * suffix and `.gksedu.mn` is not, and the browser silently drops the cookie
 * when the guess is wrong. Host-only is always accepted, and `document.cookie`
 * reads it back regardless of which of us wrote it.
 */

export const EXTERNAL_ID_COOKIE = 'gks_eid';
export const FBP_COOKIE = '_fbp';
export const FBC_COOKIE = '_fbc';

/** Meta's own lifetime for `_fbp` / `_fbc`, and the attribution window they serve. */
const CLICK_COOKIE_DAYS = 90;
/** Ours outlives them: a study-abroad decision takes months, and a `Purchase` still needs a match. */
const EXTERNAL_ID_DAYS = 365;

export function readCookie(name: string, jar: string): string | undefined {
  for (const part of jar.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim()) || undefined;
    }
  }
  return undefined;
}

function writeCookie(name: string, value: string, days: number): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; Max-Age=${days * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
}

/** 128 bits of randomness, hex — used for event ids and the visitor id. */
export function randomId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * A fresh event id. The browser generates it, uses it for the pixel event, and
 * — for a conversion the server reports too — sends it along so both halves
 * carry the same one and Meta counts the person once.
 */
export const newEventId = randomId;

/**
 * `fb.<subdomainIndex>.<creationTime>.<random>`. The index is 1 for a
 * host-only cookie on the registrable domain, which is what we write.
 */
export function newFbp(now = Date.now(), random = Math.random()): string {
  return `fb.1.${now}.${Math.floor(random * 10_000_000_000)}`;
}

/** `fb.<subdomainIndex>.<clickTime>.<fbclid>` — the click id, in Meta's wrapper. */
export function newFbc(fbclid: string, now = Date.now()): string {
  return `fb.1.${now}.${fbclid}`;
}

/** Reads the `fbclid` an ad click leaves in the URL. */
export function fbclidFrom(search: string): string | undefined {
  const value = new URLSearchParams(search).get('fbclid')?.trim();
  return value || undefined;
}

/** Existing cookie, or a new one — never overwrites, because the first value is the true one. */
export function ensureExternalId(): string {
  const existing = readCookie(EXTERNAL_ID_COOKIE, document.cookie);
  if (existing) return existing;
  const id = randomId();
  writeCookie(EXTERNAL_ID_COOKIE, id, EXTERNAL_ID_DAYS);
  return id;
}

export function ensureFbp(): string | undefined {
  const existing = readCookie(FBP_COOKIE, document.cookie);
  if (existing) return existing;
  const fbp = newFbp();
  writeCookie(FBP_COOKIE, fbp, CLICK_COOKIE_DAYS);
  return fbp;
}

/**
 * A *newer* click replaces an older one — that is Meta's own rule, and it is
 * the right one: the ad someone just clicked is the ad that brought them, not
 * the one they clicked last month.
 */
export function ensureFbc(search: string): string | undefined {
  const fbclid = fbclidFrom(search);
  const existing = readCookie(FBC_COOKIE, document.cookie);

  if (!fbclid) return existing;
  if (existing?.endsWith(`.${fbclid}`)) return existing;

  const fbc = newFbc(fbclid);
  writeCookie(FBC_COOKIE, fbc, CLICK_COOKIE_DAYS);
  return fbc;
}

export interface MetaTrackingPayload {
  eventId: string;
  fbp?: string;
  fbc?: string;
  externalId?: string;
  eventSourceUrl?: string;
}

/**
 * What a form sends the API alongside its own payload, so the server-side
 * conversion carries the click and deduplicates against the browser's.
 */
export function trackingPayload(eventId: string): MetaTrackingPayload {
  return {
    eventId,
    fbp: readCookie(FBP_COOKIE, document.cookie),
    fbc: readCookie(FBC_COOKIE, document.cookie),
    externalId: readCookie(EXTERNAL_ID_COOKIE, document.cookie),
    eventSourceUrl: location.href,
  };
}
