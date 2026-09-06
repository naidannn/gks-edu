/**
 * The rules behind the head tags — the parts worth testing, with no Nuxt in
 * them. `composables/useSeo.ts` is the thin layer that reads the route and the
 * runtime config and hands the answers to Unhead.
 */

/**
 * `index, follow` is what a crawler assumes anyway; the two limits are the
 * point. Without `max-image-preview:large` Google shows the catalogue's campus
 * photos as thumbnails, and `max-snippet:-1` lets it quote a whole answer out
 * of the FAQ instead of two lines.
 */
export const ROBOTS_INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1';

/** Crawl the links, keep the page itself out of the index. */
export const ROBOTS_FILTERED = 'noindex, follow';

/** `/universities/` and `/universities` are one page; the trailing slash goes. */
export function canonicalPath(path: string): string {
  return path.replace(/\/+$/, '') || '/';
}

/**
 * Open Graph and JSON-LD both reject a relative image path, and the API hands
 * us site-relative ones (`/universities/logos/…`, an uploaded cover). Already
 * absolute URLs pass through.
 */
export function absoluteUrl(siteUrl: string, path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * What a listing page tells a crawler about the query string it is wearing.
 *
 * A filtered catalogue is one page with a query string, not a new page.
 * `/programs?field=marketing&level=BACHELOR&topik=4` is thousands of URLs over
 * the same rows; left indexable they dilute the one page we want ranking and
 * eat the crawl budget of a 135-school catalogue. So a filtered view points its
 * canonical at the bare path and asks not to be indexed — `follow`, not
 * `nofollow`, because the university links on it are still worth crawling.
 *
 * Pagination is the exception: page 2 carries rows page 1 does not, so it stays
 * indexable and canonicalises to itself. `page=1` is the bare path spelt out
 * the long way, and canonicalises back to it.
 */
export function listingSeo(
  siteUrl: string,
  path: string,
  query: Record<string, unknown>,
): { canonical: string; robots: string } {
  const filtered = Object.keys(query).some((key) => key !== 'page');
  const parsed = Number(query.page);
  const page = Number.isInteger(parsed) && parsed > 1 ? parsed : 1;

  if (filtered) return { canonical: `${siteUrl}${path}`, robots: ROBOTS_FILTERED };
  return {
    canonical: page > 1 ? `${siteUrl}${path}?page=${page}` : `${siteUrl}${path}`,
    robots: ROBOTS_INDEXABLE,
  };
}
