import { describe, expect, it } from 'vitest';
import { STUDY_FIELD_TAXONOMY, flattenTaxonomy } from './study-fields.data.js';
import {
  buildStudyFieldIndex,
  matchStudyField,
  normaliseProgramName,
  type MatchableStudyField,
} from './study-field.matcher.js';

/** The seeded taxonomy, shaped like rows off the table. */
function taxonomyAsFields(): MatchableStudyField[] {
  const fields: MatchableStudyField[] = [];

  for (const group of STUDY_FIELD_TAXONOMY) {
    fields.push({
      id: group.slug,
      slug: group.slug,
      nameMn: group.nameMn,
      nameEn: group.nameEn,
      nameKo: group.nameKo ?? null,
      aliases: group.aliases ?? [],
      parentId: null,
    });
    for (const child of group.children ?? []) {
      fields.push({
        id: child.slug,
        slug: child.slug,
        nameMn: child.nameMn,
        nameEn: child.nameEn,
        nameKo: child.nameKo ?? null,
        aliases: child.aliases ?? [],
        parentId: group.slug,
      });
    }
  }

  return fields;
}

const index = buildStudyFieldIndex(taxonomyAsFields());
const match = (...texts: (string | null)[]) => matchStudyField(index, texts)?.slug ?? null;

describe('normaliseProgramName', () => {
  it('strips the Korean words that say where a programme sits, not what it teaches', () => {
    expect(normaliseProgramName('경영학과')).toBe('경영');
    expect(normaliseProgramName('컴퓨터공학부')).toBe('컴퓨터공학');
    expect(normaliseProgramName('마케팅전공')).toBe('마케팅');
  });

  it('opens brackets instead of dropping them — the subject is often inside', () => {
    expect(normaliseProgramName('경영학과(마케팅전공)')).toBe('경영 마케팅');
  });

  it('strips the English scaffolding', () => {
    expect(normaliseProgramName('Department of Marketing')).toBe('marketing');
    expect(normaliseProgramName('School of Business Administration')).toBe('business administration');
  });

  it('strips the Mongolian scaffolding', () => {
    expect(normaliseProgramName('Маркетингийн тэнхим')).toBe('маркетингийн');
  });
});

describe('matchStudyField', () => {
  it('files the same subject from three different languages under one slug', () => {
    expect(match('마케팅학과')).toBe('marketing');
    expect(match('Department of Marketing')).toBe('marketing');
    expect(match('Маркетинг')).toBe('marketing');
  });

  it('prefers the specific subject over the group containing it', () => {
    // `경영` is in there too — but marketing is the thing being taught.
    expect(match('경영학과(마케팅전공)')).toBe('marketing');
    expect(match('경영정보학과')).toBe('management-information-systems');
  });

  it('reads the Korean name when the Mongolian one is a free-text paraphrase', () => {
    expect(match('Компьютерийн инженерчлэл', null, '컴퓨터공학과')).toBe('computer-science');
  });

  it('does not let a two-letter latin fragment match', () => {
    // `it` is a group alias; "Digital Literacy" must not be filed under it.
    expect(match('Digital Literacy')).not.toBe('it');
  });

  it('says nothing rather than guessing', () => {
    expect(match('Ерөнхий суурь хичээл')).toBeNull();
    expect(match('')).toBeNull();
  });

  it('recognises a language-prep programme', () => {
    expect(match('한국어교육원 어학연수 과정')).toBe('korean-language-program');
  });

  it('explains itself', () => {
    const result = matchStudyField(index, ['호텔경영학과']);
    expect(result?.slug).toBe('hotel-management');
    expect(result?.matchedOn).toBeTruthy();
  });
});

describe('the taxonomy itself', () => {
  it('has unique slugs', () => {
    const slugs = flattenTaxonomy().map((field) => field.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('is at most two levels deep — a group and its subjects', () => {
    for (const group of STUDY_FIELD_TAXONOMY) {
      for (const child of group.children ?? []) {
        expect(child.children).toBeUndefined();
      }
    }
  });
});
