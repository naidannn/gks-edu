/**
 * GA4, loaded only when `NUXT_PUBLIC_GA_ID` is set (1A-21). Nothing runs in
 * dev/local by default — no script tag is even injected when the id is empty.
 *
 * Page views are sent by hand (`send_page_view: false`). gtag's automatic view
 * fires when its script finishes loading, which is after Nuxt's initial
 * `router.replace`, so leaving it on double-counted the landing page.
 *
 * Sending them by hand means owning the two things gtag was doing for us:
 * *when* a view is sent, and *what is in it*. Both are commented below — they
 * were each a bug first.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const config = useRuntimeConfig();
  const gaId = config.public.gaId;
  if (!gaId) return;

  useHead({
    script: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true },
      {
        innerHTML:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
          + `gtag('js',new Date());gtag('config','${gaId}',{send_page_view:false});`,
      },
    ],
  });

  /** The last location actually reported, so no view is ever counted twice. */
  let lastSent: string | null = null;

  const target = window as unknown as { dataLayer?: unknown[] };

  /**
   * Queued on `dataLayer` directly rather than called through `window.gtag`.
   * `gtag` is defined by the snippet injected in the `useHead` above, so early
   * in the boot it does not exist yet and `gtag?.()` dropped the call in
   * silence. The queue does not care about order — gtag.js processes whatever
   * is already sitting in it when it loads — and what goes in is the
   * `arguments` object, the same shape Google's own snippet pushes, so it is
   * read identically however it arrives.
   */
  function queue(_command: string, _name: string, _params: Record<string, unknown>): void {
    target.dataLayer ??= [];
    // The parameters are named for the call site only — what is queued is the
    // `arguments` object itself, exactly as Google's snippet does it.
    // eslint-disable-next-line prefer-rest-params
    target.dataLayer.push(arguments);
  }

  function sendPageView(): void {
    if (window.location.href === lastSent) return;
    lastSent = window.location.href;

    // GA4 takes the path from `page_location`; `page_path` is a UA-ism it
    // silently ignores.
    queue('event', 'page_view', {
      page_location: window.location.href,
      page_title: document.title,
    });
  }

  /**
   * `useHead` patches the <title> during the render that follows the route
   * change, so a view sent on the same tick carries the title of the page we
   * just left. One macrotask after the render queue clears is past it.
   *
   * Deliberately a timer and not `requestAnimationFrame`: rAF does not fire at
   * all in a hidden tab, and a page opened in a background tab — middle click,
   * "open in new tab", a restored session — is a real visit that has to be
   * counted when it happens, not whenever someone gets round to looking at it.
   */
  function sendWhenTitleSettles(): void {
    void nextTick(() => setTimeout(sendPageView, 0));
  }

  // Neither hook alone covers every view. `app:mounted` fires once, for the
  // route the app booted on — the landing page, which `afterEach` never sees
  // and which therefore went uncounted entirely. `page:finish` fires for the
  // navigations after it, and is used in preference to `router.afterEach`
  // because it runs once the new page component has rendered, which is what
  // the title is waiting on. `lastSent` keeps the overlap harmless.
  nuxtApp.hook('app:mounted', sendWhenTitleSettles);
  nuxtApp.hook('page:finish', sendWhenTitleSettles);
});
