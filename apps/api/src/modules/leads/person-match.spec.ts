import { describe, expect, it } from 'vitest';
import { nameSkeleton, phoneKey, sameGivenName } from './person-match.js';

describe('phoneKey', () => {
  it.each([
    ['99112233', '99112233'],
    ['+976 9911-2233', '99112233'],
    ['97699112233', '99112233'],
    ['9911', null],
    [null, null],
  ])('%s → %s', (input, expected) => {
    expect(phoneKey(input)).toBe(expected);
  });
});

describe('sameGivenName', () => {
  // Every pair below is one person in production, typed on two channels.
  it.each([
    ['Нямбаяр', 'Nyambayar'],
    ['Содчимэг', 'Sodchimeg'],
    ['Маралжин', 'Maraljin'],
    ['Аз-Оргил', 'Az-Orgil'],
    ['Төгөлдөр', 'Tuguldur'],
    ['dolgion', 'Dolgion'],
    ['СОДБИЛЭГ', 'Содбилэг'],
    ['Мөнх эрдэнэ', 'Мөнх-Эрдэнэ'],
    ['Энхжин', 'Enkhjin'],
  ])('%s = %s', (a, b) => {
    expect(sameGivenName(a, b)).toBe(true);
  });

  it('keeps siblings apart', () => {
    expect(sameGivenName('Ариунжаргал', 'Ариунзаяа')).toBe(false);
    expect(sameGivenName('Анужин', 'Тэмүүлэн')).toBe(false);
  });

  it('treats a name nobody gave as no evidence either way', () => {
    expect(sameGivenName('—', 'Enkhjin')).toBe(true);
    expect(sameGivenName('Үл', 'Анужин')).toBe(true);
    expect(sameGivenName('Үл мэдэгдэх', 'Анужин')).toBe(true);
    expect(sameGivenName('', 'Анужин')).toBe(true);
  });

  it('does not mistake a real name for a placeholder', () => {
    expect(nameSkeleton('Үлэмж')).not.toBe('');
  });
});
