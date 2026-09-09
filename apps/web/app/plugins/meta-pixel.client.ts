import {
  EXTERNAL_ID_COOKIE,
  FBC_COOKIE,
  FBP_COOKIE,
  ensureExternalId,
  ensureFbc,
  ensureFbp,
  newEventId,
  readCookie,
} from '~/utils/meta-pixel';

/**
 * Meta pixel + the browser half of the Conversions API (1A-38), loaded only
 * when `NUXT_PUBLIC_META_PIXEL_ID` is set. Nothing runs in dev by default —
 * no script tag is injected when the id is empty.
 *
 * Two things are sent for every event, not one:
 *
 * 1. the pixel event, straight from the browser to Facebook;
 * 2. the same event, with the same `eventID`, relayed through our own API to
 *    the Conversions API.
 *
 * That is not redundancy for its own sake. `connect.facebook.net` is blocked
 * for a large minority of visitors, and for them (1) never happens at all —
 * the funnel simply loses them, and the campaign optimises on the people who
 * happen not to run a blocker. `/meta/events` is on gksedu.mn and is not
 * blocked. When both arrive, Meta deduplicates on `eventID` and counts one.
 *
 * Conversions the *server* already reports — `Lead`, `CompleteRegistration`,
 * `InitiateCheckout`, `Purchase` — go through {@link MetaApi.trackPaired}
 * instead: the pixel fires, the relay does not, because the API's own event
 * carries the same id and a far better identity (a verified name, a phone
 * number, a birth date) than a browser can.
 */

type FbqStub = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
  push: unknown;
};

interface MetaWindow extends Window {
  fbq?: FbqStub;
  _fbq?: FbqStub;
}

/** The subset of Meta's `custom_data` this site has anything to say about. */
export interface MetaCustomData {
  content_name?: string;
  content_category?: string;
  content_ids?: string[];
  content_type?: string;
  search_string?: string;
  value?: number;
  currency?: string;
}

export interface MetaApi {
  /** Fires the pixel *and* relays to the Conversions API. Returns the shared event id. */
  track: (eventName: string, customData?: MetaCustomData) => string;
  /**
   * Fires the pixel only, under an id the server will reuse for its own copy
   * of the same conversion. Use it whenever the API reports the event too.
   */
  trackPaired: (eventName: string, eventId: string, customData?: MetaCustomData) => void;
  /**
   * A custom event — one this funnel has and Meta has no standard name for.
   * The pixel needs `trackCustom` for these; the Conversions API does not care.
   */
  trackCustom: (eventName: string, customData?: MetaCustomData) => string;
  /** A fresh event id, for a form that must send one to the API before anything happens. */
  newEventId: () => string;
}

export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const pixelId = config.public.metaPixelId;

  // A no-op with the same shape, so no call site has to ask whether tracking
  // is configured — the check lives here once.
  if (!pixelId) {
    const noop: MetaApi = {
      track: () => '',
      trackPaired: () => undefined,
      trackCustom: () => '',
      newEventId,
    };
    return { provide: { meta: noop } };
  }

  const target = window as MetaWindow;

  /**
   * Meta's own snippet, written out rather than injected as HTML. The queue has
   * to exist before anything calls `fbq`, and a `<script>` added through
   * `useHead` has not necessarily run by then — the same trap the GA plugin
   * fell into with `gtag`. Defining the stub here makes it synchronous.
   */
  if (!target.fbq) {
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as FbqStub;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    target.fbq = fbq;
    target._fbq ??= fbq;
  }

  // Written before `init`, so the pixel adopts the ids rather than minting its
  // own — and so a blocked pixel still leaves the relay something to send.
  const externalId = ensureExternalId();
  ensureFbp();
  ensureFbc(window.location.search);

  useHead({
    script: [{ src: 'https://connect.facebook.net/en_US/fbevents.js', async: true }],
  });

  // Advanced matching. `external_id` is the only field we can set for every
  // visitor, signed in or not; the pixel normalises and hashes it in the
  // browser, exactly as the API does server-side, which is what makes the two
  // events match.
  target.fbq?.('init', pixelId, { external_id: externalId });

  function relay(eventName: string, eventId: string, customData?: MetaCustomData): void {
    void $fetch('/meta/events', {
      baseURL: config.public.apiBase,
      method: 'POST',
      // The tab is often closing when a conversion fires; `keepalive` lets the
      // request outlive it.
      keepalive: true,
      body: {
        eventName,
        eventId,
        eventSourceUrl: window.location.href,
        fbp: readCookie(FBP_COOKIE, document.cookie),
        fbc: readCookie(FBC_COOKIE, document.cookie),
        externalId: readCookie(EXTERNAL_ID_COOKIE, document.cookie),
        ...(customData ? { customData } : {}),
      },
      // Measurement must never surface as an error in front of a visitor.
    }).catch(() => undefined);
  }

  const meta: MetaApi = {
    track(eventName, customData) {
      const eventId = newEventId();
      target.fbq?.('track', eventName, customData ?? {}, { eventID: eventId });
      relay(eventName, eventId, customData);
      return eventId;
    },
    trackPaired(eventName, eventId, customData) {
      target.fbq?.('track', eventName, customData ?? {}, { eventID: eventId });
    },
    trackCustom(eventName, customData) {
      const eventId = newEventId();
      target.fbq?.('trackCustom', eventName, customData ?? {}, { eventID: eventId });
      relay(eventName, eventId, customData);
      return eventId;
    },
    newEventId,
  };

  /** The last location actually reported, so no view is counted twice. */
  let lastSent: string | null = null;

  function sendPageView(): void {
    if (window.location.href === lastSent) return;
    lastSent = window.location.href;
    // A navigation can also be an arrival from an ad — `?fbclid=` shows up on
    // any route, not only the landing page.
    ensureFbc(window.location.search);
    meta.track('PageView');
  }

  // Neither hook alone covers every view: `app:mounted` fires once, for the
  // route the app booted on, and `page:finish` for every navigation after it.
  // `lastSent` keeps the overlap harmless. (Same arrangement as the GA plugin,
  // minus its title dance — a Meta PageView carries no title.)
  nuxtApp.hook('app:mounted', sendPageView);
  nuxtApp.hook('page:finish', sendPageView);

  /**
   * `Contact` — tapping the office number or the address. It is the one
   * conversion the site never sees the end of: the conversation happens on the
   * phone, and without this the whole "saw the ad → rang the office" path is
   * invisible to the campaign. Delegated from the document rather than wired
   * per page, because the number is in the header and the footer of every one.
   */
  document.addEventListener(
    'click',
    (event) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="tel:"], a[href^="mailto:"]');
      if (!link) return;
      meta.track('Contact', {
        content_category: link.getAttribute('href')?.startsWith('tel:') ? 'phone' : 'email',
      });
    },
    { capture: true, passive: true },
  );

  return { provide: { meta } };
});
