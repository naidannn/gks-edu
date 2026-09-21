import { captureArrival } from '~/utils/attribution';

/**
 * Captures the campaign a visitor arrived with before anything can lose it —
 * plugin setup runs ahead of the first render, while `location.search` is still
 * the URL the ad opened. Navigations are checked too: an internal link can
 * carry `?utm_…` (a banner, a newsletter landing), and that is a new arrival.
 */
export default defineNuxtPlugin((nuxtApp) => {
  captureArrival('boot');
  nuxtApp.hook('page:finish', () => captureArrival('navigation'));
});
