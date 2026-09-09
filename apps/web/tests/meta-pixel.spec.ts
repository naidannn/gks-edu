import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXTERNAL_ID_COOKIE,
  FBC_COOKIE,
  FBP_COOKIE,
  ensureExternalId,
  ensureFbc,
  ensureFbp,
  fbclidFrom,
  newFbc,
  newFbp,
  readCookie,
  trackingPayload,
} from '../app/utils/meta-pixel';

/**
 * The cookie layer is the part of the Meta setup that has to be right without
 * anyone being able to see it working: it decides whether a conversion can be
 * attributed to the ad that produced it, and it runs mostly for the visitors
 * whose pixel never loaded — exactly the ones nobody is looking at in Events
 * Manager. So the format is asserted here rather than trusted.
 */
function clearCookies() {
  for (const name of [EXTERNAL_ID_COOKIE, FBP_COOKIE, FBC_COOKIE]) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

beforeEach(clearCookies);

describe('readCookie', () => {
  it('finds a value among its neighbours and ignores a name that merely ends the same way', () => {
    const jar = 'other=1; _fbp=fb.1.100.200; my_fbp=wrong';
    expect(readCookie('_fbp', jar)).toBe('fb.1.100.200');
    expect(readCookie('missing', jar)).toBeUndefined();
  });

  it('decodes what was written encoded', () => {
    expect(readCookie('a', 'a=x%20y')).toBe('x y');
  });
});

describe('Meta cookie formats', () => {
  it('writes _fbp as fb.<subdomainIndex>.<createdAt>.<random>', () => {
    expect(newFbp(1_700_000_000_000, 0.5)).toBe('fb.1.1700000000000.5000000000');
    expect(newFbp()).toMatch(/^fb\.1\.\d{13}\.\d+$/);
  });

  it('wraps the click id the way Meta reads it back', () => {
    expect(newFbc('IwAR123', 1_700_000_000_000)).toBe('fb.1.1700000000000.IwAR123');
  });

  it('picks the click id out of the query string', () => {
    expect(fbclidFrom('?utm_source=fb&fbclid=IwAR123')).toBe('IwAR123');
    expect(fbclidFrom('?utm_source=fb')).toBeUndefined();
    expect(fbclidFrom('')).toBeUndefined();
  });
});

describe('ensure*', () => {
  it('creates the visitor id once and then keeps it', () => {
    const first = ensureExternalId();
    expect(first).toBeTruthy();
    expect(ensureExternalId()).toBe(first);
    expect(readCookie(EXTERNAL_ID_COOKIE, document.cookie)).toBe(first);
  });

  it('stands in for the pixel when the pixel never loaded', () => {
    const fbp = ensureFbp();
    expect(fbp).toMatch(/^fb\.1\.\d{13}\.\d+$/);
    // A second call must not mint a new browser id — that would split one
    // visitor into two as far as attribution is concerned.
    expect(ensureFbp()).toBe(fbp);
  });

  it('records a click, and lets a newer click replace an older one', () => {
    expect(ensureFbc('?fbclid=FIRST')).toMatch(/\.FIRST$/);

    // No fbclid in the URL: the visitor is navigating, not arriving.
    expect(ensureFbc('')).toMatch(/\.FIRST$/);

    // A different ad, clicked later — the newer one is the one that brought them.
    expect(ensureFbc('?fbclid=SECOND')).toMatch(/\.SECOND$/);
  });

  it('does not rewrite the cookie when the same click id arrives again', () => {
    const first = ensureFbc('?fbclid=SAME');
    expect(ensureFbc('?fbclid=SAME')).toBe(first);
  });

  it('says nothing when there has never been a click', () => {
    expect(ensureFbc('?utm_source=fb')).toBeUndefined();
  });
});

describe('trackingPayload', () => {
  it('carries the event id and whatever cookies exist', () => {
    ensureExternalId();
    ensureFbp();
    ensureFbc('?fbclid=IwAR123');

    const payload = trackingPayload('event-1');

    expect(payload.eventId).toBe('event-1');
    expect(payload.fbp).toMatch(/^fb\.1\./);
    expect(payload.fbc).toMatch(/\.IwAR123$/);
    expect(payload.externalId).toBeTruthy();
    expect(payload.eventSourceUrl).toBe(location.href);
  });

  it('is still a valid payload for a visitor who has never seen an ad', () => {
    expect(trackingPayload('event-1')).toMatchObject({ eventId: 'event-1', fbc: undefined });
  });
});
