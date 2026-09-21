import { describe, expect, it } from 'vitest';
import { parseStored, readArrival } from '../app/utils/attribution';

const at = (path: string, search = '') => ({ pathname: path, search, host: 'gksedu.mn' });

/**
 * Every website lead used to be stored with no campaign: the form read
 * `utm_*` from its own URL, and nobody arrives on the form page. These pin the
 * rules that decide what the arrival page leaves behind for the form to send.
 */
describe('readArrival', () => {
  it('keeps the campaign and the page it landed on', () => {
    expect(readArrival(at('/universities/kaist', '?utm_source=facebook&utm_medium=paid&utm_campaign=gks-sep&fbclid=abc'), ''))
      .toEqual({
        source: 'facebook',
        medium: 'paid',
        campaign: 'gks-sep',
        click: 'fbclid',
        landingPage: '/universities/kaist?utm_source=facebook&utm_medium=paid&utm_campaign=gks-sep&fbclid=abc',
      });
  });

  it('counts an untagged ad click by its click id and referrer', () => {
    expect(readArrival(at('/', '?fbclid=abc'), 'https://l.facebook.com/')).toEqual({
      click: 'fbclid',
      landingPage: '/?fbclid=abc',
      referrer: 'https://l.facebook.com/',
    });
  });

  it('counts a link from another site with no parameters', () => {
    expect(readArrival(at('/gks'), 'https://www.google.com/')).toEqual({
      landingPage: '/gks',
      referrer: 'https://www.google.com/',
    });
  });

  it('ignores our own pages, reloads and direct visits', () => {
    expect(readArrival(at('/consultation', '?service=BACHELOR'), 'https://gksedu.mn/universities')).toBeNull();
    expect(readArrival(at('/'), '')).toBeNull();
    expect(readArrival(at('/'), 'not a url')).toBeNull();
  });

  it('clips what a hostile URL could make unbounded', () => {
    const arrival = readArrival(at('/', `?utm_campaign=${'x'.repeat(300)}`), '');
    expect(arrival?.campaign).toHaveLength(120);
  });
});

describe('parseStored', () => {
  const now = Date.UTC(2026, 8, 21);
  const day = 24 * 60 * 60 * 1000;

  it('returns the arrival without its timestamp', () => {
    expect(parseStored(JSON.stringify({ source: 'facebook', at: now - day }), now)).toEqual({ source: 'facebook' });
  });

  it('forgets an arrival older than 30 days, and anything malformed', () => {
    expect(parseStored(JSON.stringify({ source: 'facebook', at: now - 31 * day }), now)).toBeNull();
    expect(parseStored(JSON.stringify({ source: 'facebook' }), now)).toBeNull();
    expect(parseStored('{', now)).toBeNull();
    expect(parseStored(null, now)).toBeNull();
  });
});
