/**
 * The head tags every page needs and no page should have to remember.
 *
 * `useSiteSeo()` runs once, from `app.vue`, and stamps a canonical URL, the
 * site's Open Graph identity and a default share image onto every route. A page
 * overrides any of it by writing the same tag afterwards — Unhead keys `meta` by
 * name/property and the canonical link by `key`, so the last writer wins and a
 * page never has to know what the default was.
 *
 * Canonicals are built from `siteUrl`, never from the request origin: the site
 * answers on the EC2 host's own address and on `www.` as well as on gksedu.mn,
 * and only one of those may end up in an index.
 *
 * The rules themselves live in `utils/seo.ts`, where they are testable.
 */

/** 1200×630, the size Facebook and LinkedIn crop to — see `scripts/brand-images.py`. */
const DEFAULT_OG_IMAGE = '/img/og-default.jpg';

export function useSiteUrl(): string {
  return String(useRuntimeConfig().public.siteUrl).replace(/\/$/, '');
}

/**
 * `absoluteUrl` bound to this site's origin.
 *
 * A composable returning a function rather than a plain helper, because the
 * origin comes from `useRuntimeConfig()` — which must be read during setup,
 * while the conversions themselves happen later, inside a reactive `useHead`
 * getter where no Nuxt instance is available.
 */
export function useAbsoluteUrl(): (path: string | null | undefined) => string | undefined {
  const siteUrl = useSiteUrl();
  return (path) => absoluteUrl(siteUrl, path);
}

/** Site-wide defaults. Call once, from `app.vue`. */
export function useSiteSeo(): void {
  const route = useRoute();
  const siteUrl = useSiteUrl();
  const canonical = computed(() => siteUrl + canonicalPath(route.path));

  useHead({
    link: [{ rel: 'canonical', href: canonical, key: 'canonical' }],
  });

  useSeoMeta({
    ogSiteName: COMPANY.name,
    ogLocale: 'mn_MN',
    ogType: 'website',
    ogUrl: canonical,
    ogImage: `${siteUrl}${DEFAULT_OG_IMAGE}`,
    ogImageWidth: 1200,
    ogImageHeight: 630,
    ogImageAlt: 'GKS EDU GROUP — Солонгост суралцах зуучлал',
    twitterCard: 'summary_large_image',
    robots: ROBOTS_INDEXABLE,
  });
}

export interface PageSeo {
  /** The `<title>` before the site suffix — the template adds ` · GKS Edu`. */
  title: MaybeRefOrGetter<string>;
  /** The search snippet. Keep it under `DESCRIPTION_MAX`; data-built ones go through `clampDescription`. */
  description: MaybeRefOrGetter<string | undefined>;
  /** The share-card headline, when it should read differently from the title. Defaults to the title with the suffix. */
  ogTitle?: MaybeRefOrGetter<string>;
  /** The share-card text. Defaults to `description`. */
  ogDescription?: MaybeRefOrGetter<string | undefined>;
  /** Absolute URL of a page-specific share image; absent, the site default from `useSiteSeo` stands. */
  ogImage?: MaybeRefOrGetter<string | undefined>;
  ogImageAlt?: MaybeRefOrGetter<string | undefined>;
  /** Pixel size of `ogImage`. Without it the default image's 1200×630 would be claimed for it. */
  ogImageSize?: [width: number, height: number];
  ogType?: 'website' | 'article';
}

/**
 * Title, description and the share card in one call, for every indexable page.
 *
 * Pages used to write these one tag at a time, and most of them forgot one:
 * a page with a `description` but no `og:description` sends Facebook and
 * Telegram off to guess, and the Twitter tags were set on three pages out of
 * twenty. Here the share card is derived from the search snippet unless the
 * page says otherwise, so the two can only differ on purpose.
 *
 * A page-specific image replaces the default one's alt text as well — the
 * default alt describes the campus card, not whatever the page put there.
 */
export function usePageSeo(seo: PageSeo): void {
  const ogTitle = () => toValue(seo.ogTitle) ?? `${toValue(seo.title)}${SITE_TITLE_SUFFIX}`;
  const ogDescription = () => toValue(seo.ogDescription) ?? toValue(seo.description);

  useHead({ title: () => toValue(seo.title) });
  useSeoMeta({
    description: () => toValue(seo.description),
    ogTitle,
    ogDescription,
    ogType: seo.ogType ?? 'website',
    twitterTitle: ogTitle,
    twitterDescription: ogDescription,
  });

  if (seo.ogImage) {
    const image = () => toValue(seo.ogImage);
    useSeoMeta({
      ogImage: image,
      twitterImage: image,
      // Only alongside an image of the page's own: when the getter yields
      // nothing, the default image keeps the default alt.
      ogImageAlt: () => (image() ? (toValue(seo.ogImageAlt) ?? ogTitle()) : undefined),
      ogImageWidth: seo.ogImageSize?.[0],
      ogImageHeight: seo.ogImageSize?.[1],
    });
  }
}

/**
 * Everything behind a login. `robots.txt` already asks crawlers not to fetch
 * these, which is exactly why the meta tag is needed too: a page that is only
 * disallowed can still be indexed from an inbound link, title and all, because
 * the crawler never reads the page to find out it should not be. Disallow keeps
 * it out of the crawl; only `noindex` keeps it out of the index.
 */
export function useNoIndex(): void {
  useSeoMeta({ robots: 'noindex, nofollow' });
}

/** Canonical and robots for a catalogue page carrying filters (`utils/seo.ts`). */
export function useListingSeo(path: string): void {
  const route = useRoute();
  const siteUrl = useSiteUrl();
  const seo = computed(() => listingSeo(siteUrl, path, route.query));

  useHead({
    link: [{ rel: 'canonical', key: 'canonical', href: computed(() => seo.value.canonical) }],
  });
  useSeoMeta({ robots: computed(() => seo.value.robots) });
}

/**
 * One JSON-LD block for `useHead`'s `script` array.
 *
 * `textContent`, not `innerHTML`: Unhead serialises the object itself and
 * escapes it, so a school name containing `</script>` cannot end the block.
 * Serialisation is `JSON.stringify`, which drops `undefined` properties — that
 * is what makes the call sites readable, since a field we do not have can be
 * written as `undefined` and simply vanish rather than being asserted as
 * `null`, which Google reads as a claim that the value is empty.
 */
export function jsonLdScript(data: Record<string, unknown>) {
  return { type: 'application/ld+json' as const, textContent: data };
}
