/**
 * Dynamic sitemap: static pages + every published university and post (1A-19).
 * Regenerated per request — the catalogue changes daily, not worth caching yet.
 */
interface Paginated<T> {
  items: T[];
  meta: { totalPages: number };
}

const PAGE_LIMIT = 100;

async function collectSlugs(apiBase: string, path: string): Promise<string[]> {
  const slugs: string[] = [];
  let page = 1;

  for (;;) {
    const result = await $fetch<Paginated<{ slug: string }>>(path, {
      baseURL: apiBase,
      query: { page, limit: PAGE_LIMIT },
    }).catch(() => null);
    if (!result) break;

    slugs.push(...result.items.map((item) => item.slug));
    if (page >= result.meta.totalPages) break;
    page += 1;
  }

  return slugs;
}

function urlEntry(loc: string, changefreq: string, priority: string): string {
  return `  <url><loc>${loc}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '');
  const apiBase = String(config.public.apiBase);

  const [universitySlugs, postSlugs] = await Promise.all([
    collectSlugs(apiBase, '/universities'),
    collectSlugs(apiBase, '/posts'),
  ]);

  const entries = [
    urlEntry(siteUrl, 'daily', '1.0'),
    urlEntry(`${siteUrl}/universities`, 'daily', '0.9'),
    urlEntry(`${siteUrl}/gks-scholarship`, 'weekly', '0.8'),
    urlEntry(`${siteUrl}/consultation`, 'monthly', '0.6'),
    urlEntry(`${siteUrl}/blog`, 'daily', '0.7'),
    urlEntry(`${siteUrl}/faq`, 'monthly', '0.5'),
    ...universitySlugs.map((slug) => urlEntry(`${siteUrl}/universities/${slug}`, 'weekly', '0.8')),
    ...postSlugs.map((slug) => urlEntry(`${siteUrl}/blog/${slug}`, 'monthly', '0.6')),
  ];

  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
});
