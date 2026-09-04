/**
 * GA4, loaded only when `NUXT_PUBLIC_GA_ID` is set (1A-21). Nothing runs in
 * dev/local by default — no script tag is even injected when the id is empty.
 */
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  const gaId = config.public.gaId;
  if (!gaId) return;

  useHead({
    script: [
      { src: `https://www.googletagmanager.com/gtag/js?id=${gaId}`, async: true },
      {
        innerHTML: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
      },
    ],
  });

  const router = useRouter();
  router.afterEach((to) => {
    const gtag = (window as { gtag?: (...args: unknown[]) => void }).gtag;
    gtag?.('event', 'page_view', { page_path: to.fullPath });
  });
});
