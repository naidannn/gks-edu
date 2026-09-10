import { describe, expect, it } from 'vitest';
import { mergeQuery, readFlag, readNumber, readString } from '../app/utils/query-state';

describe('query readers', () => {
  it('reads a string, and falls back on anything that is not one', () => {
    expect(readString('seoul')).toBe('seoul');
    expect(readString('', 'all')).toBe('all');
    // A parameter given twice arrives as an array.
    expect(readString(['a', 'b'], 'all')).toBe('all');
    expect(readString(undefined, 'all')).toBe('all');
  });

  it('reads a positive integer, and falls back on everything else', () => {
    expect(readNumber('3', 1)).toBe(3);
    expect(readNumber('0', 1)).toBe(1);
    expect(readNumber('-2', 1)).toBe(1);
    expect(readNumber('later', 1)).toBe(1);
    expect(readNumber(undefined, 1)).toBe(1);
  });

  it('reads a flag only as "1"', () => {
    expect(readFlag('1')).toBe(true);
    expect(readFlag('true')).toBe(false);
    expect(readFlag(undefined)).toBe(false);
  });
});

describe('mergeQuery', () => {
  it('folds the patch in and drops what has no value', () => {
    expect(mergeQuery({ q: 'it', region: 'seoul' }, { region: '', level: 'BACHELOR' })).toEqual({
      q: 'it',
      level: 'BACHELOR',
    });
  });

  it('writes a true flag as "1" and drops a false one', () => {
    expect(mergeQuery({ gks: '1' }, { gks: false, languagePrep: true })).toEqual({ languagePrep: '1' });
  });

  it('resets the page on a filter change and keeps it when asked', () => {
    expect(mergeQuery({ page: '7', q: 'it' }, { region: 'seoul' })).toEqual({ q: 'it', region: 'seoul' });
    expect(mergeQuery({ page: '7', q: 'it' }, { page: 8 }, { resetPage: false })).toEqual({
      page: '8',
      q: 'it',
    });
  });

  it('leaves a parameter the page never declared alone', () => {
    expect(mergeQuery({ ref: 'fb-ad-3' }, { q: 'it' })).toEqual({ ref: 'fb-ad-3', q: 'it' });
  });
});
