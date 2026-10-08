import { describe, expect, it } from 'vitest';
import {
  ROBOTS_FILTERED,
  ROBOTS_INDEXABLE,
  DESCRIPTION_MAX,
  absoluteUrl,
  breadcrumbJsonLd,
  canonicalPath,
  clampDescription,
  faqPageJsonLd,
  listingSeo,
} from '../app/utils/seo';

const SITE = 'https://gksedu.mn';

describe('canonicalPath', () => {
  it('keeps the root slash', () => {
    expect(canonicalPath('/')).toBe('/');
  });

  // `/universities` and `/universities/` serve the same page; if they
  // canonicalise differently the catalogue is indexed twice.
  it('drops a trailing slash', () => {
    expect(canonicalPath('/universities/')).toBe('/universities');
    expect(canonicalPath('/universities')).toBe('/universities');
  });
});

describe('absoluteUrl', () => {
  it('resolves a site-relative path against the canonical origin', () => {
    expect(absoluteUrl(SITE, '/universities/logos/kaist.png')).toBe(
      'https://gksedu.mn/universities/logos/kaist.png',
    );
  });

  it('leaves an already absolute URL alone', () => {
    expect(absoluteUrl(SITE, 'https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
  });

  // A missing cover image has to drop the og:image tag, not emit an empty one —
  // the site-wide default then stands in.
  it('is undefined for a missing path', () => {
    expect(absoluteUrl(SITE, null)).toBeUndefined();
    expect(absoluteUrl(SITE, '')).toBeUndefined();
  });
});

describe('listingSeo', () => {
  it('indexes the bare catalogue against itself', () => {
    expect(listingSeo(SITE, '/universities', {})).toEqual({
      canonical: 'https://gksedu.mn/universities',
      robots: ROBOTS_INDEXABLE,
    });
  });

  // Page 2 holds rows page 1 does not, so it is its own page.
  it('indexes a later page against itself', () => {
    expect(listingSeo(SITE, '/universities', { page: '3' })).toEqual({
      canonical: 'https://gksedu.mn/universities?page=3',
      robots: ROBOTS_INDEXABLE,
    });
  });

  it('treats page=1 as the bare path spelt out the long way', () => {
    expect(listingSeo(SITE, '/universities', { page: '1' }).canonical).toBe(
      'https://gksedu.mn/universities',
    );
  });

  // The whole point: thousands of filter permutations must not become
  // thousands of indexed pages over the same rows.
  it('keeps a filtered view out of the index and points it at the bare path', () => {
    expect(listingSeo(SITE, '/programs', { field: 'marketing', topik: '4' })).toEqual({
      canonical: 'https://gksedu.mn/programs',
      robots: ROBOTS_FILTERED,
    });
  });

  it('a filtered page 2 is still just the filtered view', () => {
    expect(listingSeo(SITE, '/programs', { field: 'marketing', page: '2' })).toEqual({
      canonical: 'https://gksedu.mn/programs',
      robots: ROBOTS_FILTERED,
    });
  });

  // A hand-typed `?page=пять` must not end up in the canonical URL.
  it('ignores a page that is not a whole number', () => {
    for (const page of ['0', '-2', 'abc', '2.5']) {
      expect(listingSeo(SITE, '/blog', { page }).canonical).toBe('https://gksedu.mn/blog');
    }
  });
});

describe('clampDescription', () => {
  it('passes a short description through, whitespace collapsed', () => {
    expect(clampDescription('  Сөүл   хотод\nбайрлах  ')).toBe('Сөүл хотод байрлах');
  });

  it('turns nothing into undefined rather than an empty tag', () => {
    expect(clampDescription(null)).toBeUndefined();
    expect(clampDescription('   ')).toBeUndefined();
  });

  // A snippet cut mid-word reads as broken; the cut falls on a space.
  it('cuts a long text on a word boundary, with an ellipsis, within the limit', () => {
    const long = 'Солонгосын их сургуулийн элсэлт, '.repeat(10);
    const clamped = clampDescription(long)!;
    expect(clamped.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(clamped.endsWith('…')).toBe(true);
    expect(clamped).not.toMatch(/[,\s]…$/);
    expect(long.startsWith(clamped.slice(0, -1))).toBe(true);
  });
});

describe('faqPageJsonLd', () => {
  it('maps question/answer pairs onto schema.org Questions', () => {
    expect(faqPageJsonLd([{ question: 'Q?', answer: 'A.' }])).toEqual({
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
    });
  });

  // An empty `mainEntity` is invalid markup; better no block at all.
  it('yields nothing for an empty list', () => {
    expect(faqPageJsonLd([])).toBeUndefined();
  });
});

describe('breadcrumbJsonLd', () => {
  it('links every crumb but the last, and keeps the root without a trailing slash', () => {
    expect(breadcrumbJsonLd(SITE, [['Нүүр', '/'], ['Сургуулиуд', '/universities'], ['KAIST']])).toEqual({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Нүүр', item: SITE },
        { '@type': 'ListItem', position: 2, name: 'Сургуулиуд', item: `${SITE}/universities` },
        { '@type': 'ListItem', position: 3, name: 'KAIST', item: undefined },
      ],
    });
  });
});
