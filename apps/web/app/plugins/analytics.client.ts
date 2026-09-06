/**
 * GA4, loaded only when `NUXT_PUBLIC_GA_ID` is set (1A-21). Nothing runs in
 * dev/local by default — no script tag is even injected when the id is empty.
 *
 * Page views are sent by hand rather than by gtag: Nuxt's own initial
 * `router.replace` runs after this plugin is installed, so gtag's automatic
 * view and the router's first `afterEach` would both report the landing page.
 * `send_page_view: false` makes `afterEach` the single source of them.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const gaId = config.public.gaId;
  if (!gaId) return;

  useHead({
    script: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true },
      {
        innerHTML:
          `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
          `gtag('js',new Date());gtag('config','${gaId}',{send_page_view:false});`,
      },
    ],
  });

  const router = useRouter();
  router.afterEach(async () => {
    // `useHead` writes the new <title> on the next tick; without the wait every
    // view would carry the title of the page we just left.
    await nextTick();
    const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
    // GA4 derives the page path from `page_location`; `page_path` is a UA-ism
    // it silently ignores.
    gtag?.('event', 'page_view', {
      page_location: window.location.href,
      page_title: document.title,
    });
  });
});
