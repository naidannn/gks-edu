/** Static robots.txt — everything public is crawlable, account/admin pages are not (1A-19). */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '');

  setHeader(event, 'content-type', 'text/plain; charset=utf-8');
  return [
    'User-agent: *',
    'Disallow: /account/',
    'Disallow: /admin/',
    'Disallow: /documents',
    'Disallow: /search',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    '',
  ].join('\n');
});
