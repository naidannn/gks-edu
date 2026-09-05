import { describe, expect, it } from 'vitest';
import {
  NO_UNIVERSITY_LABEL,
  toUniversityOptions,
  universityLabel,
  universityName,
  universitySearchText,
  universitySubName,
} from '../app/utils/university-name';

/**
 * The naming rule the CRM runs on: English leads, because that is the name
 * printed on the paperwork staff are holding.
 */
const kyungHee = {
  id: 'u1',
  nameEn: 'Kyung Hee University',
  nameMn: 'Кёнхи их сургууль',
  nameKo: '경희대학교',
  cityMn: 'Сөүл',
};

describe('universityName', () => {
  it('leads with the English name', () => {
    expect(universityName(kyungHee)).toBe('Kyung Hee University');
  });

  // Older rows and narrow payloads may carry only one name; a blank cell is
  // never the right answer.
  it('falls back to the Mongolian name when there is no English one', () => {
    expect(universityName({ nameMn: 'Кёнхи их сургууль' })).toBe('Кёнхи их сургууль');
  });

  it('uses the fallback when the school is not chosen', () => {
    expect(universityName(null)).toBe('—');
    expect(universityName(undefined, NO_UNIVERSITY_LABEL)).toBe(NO_UNIVERSITY_LABEL);
  });
});

describe('universitySubName', () => {
  it('puts the Mongolian name and the city on the second line', () => {
    expect(universitySubName(kyungHee)).toBe('Кёнхи их сургууль · Сөүл');
  });

  // Nothing is gained by printing the same name twice.
  it('says nothing when it would only repeat the first line', () => {
    expect(universitySubName({ nameEn: 'Gyeongkuk National University', nameMn: 'Gyeongkuk National University' }))
      .toBeNull();
  });
});

describe('universityLabel', () => {
  it('joins both lines for a single-line caller', () => {
    expect(universityLabel(kyungHee)).toBe('Kyung Hee University · Кёнхи их сургууль · Сөүл');
  });
});

describe('universitySearchText', () => {
  // Staff type whichever name they know — including the Korean one.
  it('matches on every name and the city', () => {
    const haystack = universitySearchText(kyungHee);
    for (const term of ['kyung hee', 'кёнхи', '경희대학교', 'сөүл']) {
      expect(haystack).toContain(term);
    }
  });
});

describe('toUniversityOptions', () => {
  it('leads with the empty row so "not chosen" stays selectable', () => {
    const options = toUniversityOptions([kyungHee]);
    expect(options[0]).toEqual({ value: '', label: NO_UNIVERSITY_LABEL });
  });

  it('carries the Korean name as an invisible search key', () => {
    const [, option] = toUniversityOptions([kyungHee]);
    expect(option).toEqual({
      value: 'u1',
      label: 'Kyung Hee University',
      sub: 'Кёнхи их сургууль · Сөүл',
      keywords: '경희대학교',
    });
  });
});
