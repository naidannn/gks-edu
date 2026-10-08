import { describe, expect, it } from 'vitest';
import { catalogueNameKey } from './catalogue-name.js';

describe('catalogueNameKey (1I-14)', () => {
  it('treats a Korean name with and without its spaces as one', () => {
    expect(catalogueNameKey('글로벌 경영학과')).toBe(catalogueNameKey('글로벌경영학과'));
    expect(catalogueNameKey(' 컴퓨터　공학과 ')).toBe('컴퓨터공학과');
  });

  it('ignores the case of Latin letters inside a Korean name', () => {
    expect(catalogueNameKey('AI융합학부')).toBe(catalogueNameKey('ai융합학부'));
  });

  it('keeps different departments apart', () => {
    expect(catalogueNameKey('경영학과')).not.toBe(catalogueNameKey('경영학부'));
  });

  it('is null for a missing or blank name, which never collides', () => {
    expect(catalogueNameKey(null)).toBeNull();
    expect(catalogueNameKey(undefined)).toBeNull();
    expect(catalogueNameKey('   ')).toBeNull();
  });
});
