/**
 * Dynamic sitemap: the static public pages, every published university and
 * every published post (1A-19).
 *
 * Only clean URLs go in. A filtered catalogue (`/programs?field=…`) is the same
 * page with a query string and carries `noindex` for exactly that reason, so
 * listing it here would be asking a crawler to fetch what we just told it to
 * ignore.
 *
 * Rebuilt per request — three paginated API calls, and Googlebot fetches this
 * a few times a day, not a few times a second. The `Cache-Control` header is
 * for the CDN and the crawler's own conditional refetch.
 */
interface Paginated<T> {
  items: T[];
  meta: { totalPages: number };
}

interface SitemapUrl {
  loc: string;
  changefreq: string;
  priority: string;
  /** W3C date. Omitted rather than guessed — a wrong `lastmod` gets the whole file distrusted. */
  lastmod?: string;
}

const PAGE_LIMIT = 100;

async function collect<T>(apiBase: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let page = 1;

  for (;;) {
    const result = await $fetch<Paginated<T>>(path, {
      baseURL: apiBase,
      query: { page, limit: PAGE_LIMIT },
    }).catch(() => null);
    if (!result) break;

    items.push(...result.items);
    if (page >= result.meta.totalPages) break;
    page += 1;
  }

  return items;
}

function toXml({ loc, changefreq, priority, lastmod }: SitemapUrl): string {
  const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `  <url><loc>${loc}</loc>${modified}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/** `2026-09-06T…Z` → `2026-09-06`; anything unparseable is dropped, not guessed. */
function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const siteUrl = String(config.public.siteUrl).replace(/\/$/, '');
  const apiBase = String(config.public.apiBase);

  const [universities, posts] = await Promise.all([
    collect<{ slug: string }>(apiBase, '/universities'),
    collect<{ slug: string; publishedAt: string | null }>(apiBase, '/posts'),
  ]);

  // Paths as the pages canonicalise themselves — the root keeps its slash, the
  // rest have none. A sitemap entry that differs from the page's own canonical
  // is a contradiction, and Search Console reports it as one.
  const staticPages: [string, string, string][] = [
    ['/', 'daily', '1.0'],
    ['/universities', 'daily', '0.9'],
    ['/programs', 'weekly', '0.9'],
    ['/admissions', 'daily', '0.9'],
    ['/plan', 'monthly', '0.8'],
    ['/services/language-prep', 'weekly', '0.8'],
    ['/services/bachelor', 'weekly', '0.8'],
    ['/services/graduate', 'weekly', '0.8'],
    ['/gks-scholarship', 'weekly', '0.8'],
    ['/blog', 'daily', '0.7'],
    ['/consultation', 'monthly', '0.6'],
    ['/about', 'monthly', '0.6'],
    ['/contact', 'monthly', '0.6'],
    ['/faq', 'monthly', '0.5'],
    ['/terms', 'yearly', '0.3'],
    ['/privacy', 'yearly', '0.3'],
    ['/refund', 'yearly', '0.3'],
  ];

  const entries: SitemapUrl[] = [
    ...staticPages.map(([path, changefreq, priority]) => ({
      loc: `${siteUrl}${path}`,
      changefreq,
      priority,
    })),
    ...universities.map((university) => ({
      loc: `${siteUrl}/universities/${university.slug}`,
      changefreq: 'weekly',
      priority: '0.8',
    })),
    ...posts.map((post) => ({
      loc: `${siteUrl}/blog/${post.slug}`,
      changefreq: 'monthly',
      priority: '0.6',
      lastmod: isoDate(post.publishedAt),
    })),
  ];

  setHeader(event, 'content-type', 'application/xml; charset=utf-8');
  setHeader(event, 'cache-control', 'public, max-age=3600');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(toXml).join('\n')}\n</urlset>\n`;
});
