import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildUserData,
  matchSignalCount,
  normalizeBirthDate,
  normalizeEmail,
  normalizeGender,
  normalizeIp,
  normalizeName,
  normalizePhone,
} from './meta-user-data.js';

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * These are Meta's normalisation rules, and they are the whole ball game: the
 * browser pixel applies them to its advanced-matching fields and we apply them
 * here, and a difference of one character means the two events are about two
 * different people as far as Facebook is concerned.
 */
describe('normalisation', () => {
  it.each([
    ['  Test@Example.COM ', 'test@example.com'],
    ['bat@gks.mn', 'bat@gks.mn'],
  ])('lower-cases and trims the address %s', (input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
  });

  it('drops something that is not an address rather than hashing it', () => {
    expect(normalizeEmail('n/a')).toBeUndefined();
    expect(normalizeEmail('')).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
  });

  it.each([
    ['99112233', '97699112233'],
    ['9911-2233', '97699112233'],
    ['+976 9911 2233', '97699112233'],
    ['(976) 9911-2233', '97699112233'],
    ['0097699112233', '97699112233'],
  ])('gives %s a country code and strips the formatting', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it('drops a number too short to be one', () => {
    expect(normalizePhone('1234')).toBeUndefined();
  });

  it('reduces a name to letters', () => {
    expect(normalizeName('  Дорж-Бат ')).toBe('доржбат');
    expect(normalizeName("O'Brien")).toBe('obrien');
    // Cyrillic survives: Meta matches on UTF-8, and the office types Mongolian.
    expect(normalizeName('Бат')).toBe('бат');
  });

  it('maps the gender enum, and says nothing about OTHER', () => {
    expect(normalizeGender('MALE')).toBe('m');
    expect(normalizeGender('FEMALE')).toBe('f');
    expect(normalizeGender('OTHER')).toBeUndefined();
    expect(normalizeGender(null)).toBeUndefined();
  });

  it('writes a birth date as YYYYMMDD in UTC', () => {
    expect(normalizeBirthDate(new Date('2004-03-09T00:00:00.000Z'))).toBe('20040309');
    expect(normalizeBirthDate('not a date')).toBeUndefined();
  });

  it('unwraps the IPv4-mapped form Node reports on a dual-stack socket', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });
});

describe('buildUserData', () => {
  it('hashes every personal field and leaves Meta’s own identifiers alone', () => {
    const userData = buildUserData({
      email: ' Bat@Example.com ',
      phone: '9911-2233',
      firstName: 'Бат',
      lastName: 'Дорж',
      country: 'MN',
      externalIds: ['USER-1'],
      fbp: 'fb.1.1700000000000.1234567890',
      fbc: 'fb.1.1700000000000.AbCd',
      clientIpAddress: '203.0.113.9',
      clientUserAgent: 'Mozilla/5.0',
    });

    expect(userData.em).toEqual([sha256('bat@example.com')]);
    expect(userData.ph).toEqual([sha256('97699112233')]);
    expect(userData.fn).toEqual([sha256('бат')]);
    expect(userData.country).toEqual([sha256('mn')]);
    // External ids are lower-cased before hashing, exactly as the pixel does.
    expect(userData.external_id).toEqual([sha256('user-1')]);
    expect(userData.fbp).toBe('fb.1.1700000000000.1234567890');
    expect(userData.client_ip_address).toBe('203.0.113.9');
  });

  it('leaves out what it does not know instead of hashing an empty string', () => {
    const userData = buildUserData({ email: 'bat@example.com' });

    expect(Object.keys(userData)).toEqual(['em']);
    expect(userData.ph).toBeUndefined();
  });

  it('does not hash a value that already is a hash', () => {
    const already = sha256('user-1');
    expect(buildUserData({ externalIds: [already] }).external_id).toEqual([already]);
  });

  it('deduplicates ids so one person is not counted as several', () => {
    const userData = buildUserData({ externalIds: ['user-1', 'USER-1', undefined, null] });
    expect(userData.external_id).toHaveLength(1);
  });

  it('counts matching signals without the address and the user agent', () => {
    const userData = buildUserData({
      email: 'bat@example.com',
      phone: '99112233',
      clientIpAddress: '203.0.113.9',
      clientUserAgent: 'Mozilla/5.0',
    });
    expect(matchSignalCount(userData)).toBe(2);
  });
});
