/**
 * Where a visitor came from — the `utm` block every public form sends.
 *
 * The query string that names the campaign is only there on the page the
 * visitor arrived on. Nobody lands on `/consultation`: they arrive on a school
 * page or the home page from an ad, read for a while, and only then fill the
 * form — by which time `route.query` holds nothing but the form's own
 * `?service=`. Reading the campaign at submit time is how every website lead
 * came to be stored without one. So the arrival is captured once, when the app
 * boots, and every form reads it back from here.
 *
 * What counts as an arrival: a URL carrying campaign parameters or an ad click
 * id, or a referrer from another site. A newer arrival replaces an older one —
 * the ad someone just clicked is the one that brought them (Meta's rule for
 * `_fbc` too). A reload, a new tab or a link from our own pages is not an
 * arrival and keeps what is stored. It lives in `localStorage` for 30 days,
 * because a study-abroad enquiry rarely happens in the session the ad opened.
 */

export const ATTRIBUTION_STORE = 'gks:attribution';
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PARAMS = {
  utm_source: 'source',
  utm_medium: 'medium',
  utm_campaign: 'campaign',
  utm_content: 'content',
  utm_term: 'term',
} as const;

/** Ad click ids, in the order they are checked. Only the kind is kept, not the id. */
const CLICK_IDS = ['fbclid', 'gclid'] as const;

export interface Attribution {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  /** Which ad click id the arrival URL carried — `fbclid` means a Facebook/Instagram link click. */
  click?: string;
  /** The page the visitor arrived on, with its query. */
  landingPage?: string;
  /** The other site that sent them. */
  referrer?: string;
}

/** What a form sends: the arrival, plus the page the form itself was on. */
export interface AttributionPayload extends Attribution {
  formPage?: string;
}

interface Stored extends Attribution {
  at: number;
}

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function isExternal(referrer: string, host: string): boolean {
  if (!referrer) return false;
  try {
    return new URL(referrer).host !== host;
  } catch {
    return false;
  }
}

/**
 * The arrival this URL represents, or `null` when it is not one (a reload, an
 * internal link, a direct visit with nothing to say).
 */
export function readArrival(
  location: { pathname: string; search: string; host: string },
  referrer: string,
): Attribution | null {
  const params = new URLSearchParams(location.search);
  const arrival: Attribution = {};

  for (const [param, key] of Object.entries(PARAMS)) {
    const value = params.get(param)?.trim();
    if (value) arrival[key] = clip(value, 120);
  }
  const click = CLICK_IDS.find((id) => params.get(id));
  if (click) arrival.click = click;

  const external = isExternal(referrer, location.host);
  if (Object.keys(arrival).length === 0 && !external) return null;

  arrival.landingPage = clip(location.pathname + location.search, 500);
  if (external) arrival.referrer = clip(referrer, 500);
  return arrival;
}

/** The stored arrival, unless it has outlived the attribution window. */
export function parseStored(raw: string | null, now = Date.now()): Attribution | null {
  if (!raw) return null;
  try {
    const { at, ...attribution } = JSON.parse(raw) as Stored;
    if (typeof at !== 'number' || now - at > TTL_MS) return null;
    return attribution;
  } catch {
    return null;
  }
}

/**
 * Records the current URL if it is an arrival. On boot the referrer counts; on
 * a client-side navigation it does not — `document.referrer` still names the
 * site the visitor came from an hour ago, and reading it again would move the
 * landing page to wherever they happen to be now.
 */
export function captureArrival(kind: 'boot' | 'navigation'): void {
  if (import.meta.server) return;
  const arrival = readArrival(window.location, kind === 'boot' ? document.referrer : '');
  if (!arrival) return;
  try {
    window.localStorage.setItem(ATTRIBUTION_STORE, JSON.stringify({ ...arrival, at: Date.now() } satisfies Stored));
  } catch {
    // Storage blocked (private mode, strict settings) — the form falls back to the live URL.
  }
}

/**
 * The `utm` block for a form. Without a stored arrival — storage blocked, or a
 * direct visit — the current URL is read as the arrival, which is what the form
 * used to do and still right for someone who opened the form link itself.
 */
export function attributionPayload(): AttributionPayload {
  if (import.meta.server) return {};
  const formPage = clip(window.location.pathname + window.location.search, 500);

  let stored: Attribution | null;
  try {
    stored = parseStored(window.localStorage.getItem(ATTRIBUTION_STORE));
  } catch {
    stored = null;
  }

  const arrival = stored ?? readArrival(window.location, document.referrer) ?? { landingPage: formPage };
  return { ...arrival, formPage };
}
