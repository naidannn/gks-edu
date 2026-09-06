/**
 * Static robots.txt (1A-19).
 *
 * Everything public is crawlable; the two shells behind a login and the
 * one-off auth screens are not. Note what is *not* here: the catalogue's
 * filter query strings. Those are handled with `noindex, follow` on the page
 * itself (`useSeo.ts`), because a URL that is merely disallowed is never
 * fetched — so the crawler never reads the `noindex` and can still list the
 * URL from an inbound link. Disallow hides the crawl; only the meta tag keeps
 * a page out of the index.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '');

  const disallow = [
    '/admin/', // CRM
    '/app/', // client cabinet
    '/account/',
    '/documents',
    '/messages',
    '/search',
    // Auth screens: no content, and a search result landing on one is a dead end.
    '/login',
    '/register',
    '/claim',
    '/forgot-password',
    '/reset-password',
  ];

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  return [
    'User-agent: *',
    ...disallow.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
});
