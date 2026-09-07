import { describe, expect, it } from 'vitest';
import { InstructionLanguage } from '../../../prisma/client.js';
import { ProgramResearchParseError, parseProgramResearchResult } from './program-candidate.parser.js';

const parse = (payload: unknown, grounded = true) =>
  parseProgramResearchResult(payload, { grounded });

const candidate = (overrides: Record<string, unknown> = {}) => ({
  level: 'BACHELOR',
  nameKo: '경영학과',
  nameEn: 'Business Administration',
  faculty: '경영대학',
  durationYears: 4,
  tuitionPerTermKrw: 4_200_000,
  tuitionPerYearKrw: null,
  admissionFeeKrw: 990_000,
  tuitionYear: 2026,
  scholarshipMaxPercent: 50,
  scholarshipNote: 'TOPIK 4-өөс дээш бол 50%',
  topikLevel: 3,
  language: 'KOREAN',
  confidence: 'HIGH',
  sourceUrl: 'https://example.ac.kr/tuition',
  note: null,
  ...overrides,
});

describe('parseProgramResearchResult', () => {
  it('accepts a well-formed reply', () => {
    const result = parse({ candidates: [candidate()], sources: ['https://example.ac.kr/tuition'] });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      nameKo: '경영학과',
          tuitionPerTermKrw: 4_200_000,
      confidence: 'HIGH',
    });
    expect(result.sources).toEqual(['https://example.ac.kr/tuition']);
  });

  it('refuses a reply that is not the envelope', () => {
    expect(() => parse({ programmes: [] })).toThrow(ProgramResearchParseError);
    expect(() => parse('nope')).toThrow(ProgramResearchParseError);
  });

  it('folds a bare list, and several JSON documents, back into one envelope', () => {
    const result = parse([{ candidates: [candidate()] }, [candidate({ nameKo: '마케팅학과' })]]);
    expect(result.candidates).toHaveLength(2);
  });

  it("keeps the college as the school writes it, and null when there is none", () => {
    const [withCollege] = parse({ candidates: [candidate()] }).candidates;
    expect(withCollege?.faculty).toBe('경영대학');

    const [without] = parse({ candidates: [candidate({ faculty: null })] }).candidates;
    expect(without?.faculty).toBeNull();
  });

  it('will not let a candidate claim HIGH with no page behind it', () => {
    const [row] = parse({ candidates: [candidate({ sourceUrl: null })] }).candidates;
    expect(row?.confidence).toBe('MEDIUM');
  });

  it('marks every candidate LOW when the search never ran, and says why', () => {
    const [row] = parse({ candidates: [candidate()] }, false).candidates;
    expect(row?.confidence).toBe('LOW');
    expect(row?.note).toContain('Google хайлт хийгдээгүй');
  });

  it('reads a formatted amount the way a model writes one', () => {
    const [row] = parse({ candidates: [candidate({ tuitionPerTermKrw: '4,200,000원' })] }).candidates;
    expect(row?.tuitionPerTermKrw).toBe(4_200_000);
  });

  it('drops an annual figure smaller than the semester one — it is the wrong box', () => {
    const [row] = parse({
      candidates: [candidate({ tuitionPerTermKrw: 4_200_000, tuitionPerYearKrw: 4_200_000 - 1 })],
    }).candidates;
    expect(row?.tuitionPerTermKrw).toBe(4_200_000);
    expect(row?.tuitionPerYearKrw).toBeNull();
  });

  it('drops an out-of-range fee instead of storing a plausible-looking one', () => {
    const [row] = parse({ candidates: [candidate({ tuitionPerTermKrw: 999_000_000, topikLevel: 9 })] }).candidates;
    expect(row?.tuitionPerTermKrw).toBeNull();
    expect(row?.topikLevel).toBeNull();
  });

  it('skips a nameless or unknown-level row without losing the rest', () => {
    const result = parse({
      candidates: [
        candidate({ nameKo: null, nameEn: null }),
        candidate({ level: 'DIPLOMA' }),
        candidate({ nameKo: '컴퓨터공학과', faculty: '공과대학' }),
      ],
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.faculty).toBe('공과대학');
  });

  it('defaults an unreadable language to Korean rather than guessing', () => {
    const [row] = parse({ candidates: [candidate({ language: 'MONGOLIAN' })] }).candidates;
    expect(row?.language).toBe(InstructionLanguage.KOREAN);
  });
});
