import { describe, expect, it } from 'vitest';
import { extractJson } from './gemini.service.js';
import { IntakeResearchParseError, parseResearchResult } from './intake-candidate.parser.js';

const good = {
  level: 'BACHELOR',
  year: 2027,
  month: 3,
  openAt: '2026-09-01',
  applicationDeadline: '2026-11-15',
  classStartDate: '2027-03-02',
  resultAnnouncedAt: '2026-12-20',
  quota: 40,
  admissionFeeKrw: 60_000,
  requirementNote: 'TOPIK 3',
  confidence: 'HIGH',
  sourceUrl: 'https://example.ac.kr/admissions',
  note: null,
};

describe('extractJson', () => {
  it('reads a bare JSON object', () => {
    expect(extractJson('{"candidates":[]}')).toEqual({ candidates: [] });
  });

  // Grounded replies ignore `responseMimeType` often enough that this is the
  // normal path, not an edge case.
  it('reads a fenced object', () => {
    expect(extractJson('```json\n{"candidates":[]}\n```')).toEqual({ candidates: [] });
  });

  it('reads an object with a sentence in front of it', () => {
    expect(extractJson('Here is what I found:\n{"candidates":[]}')).toEqual({ candidates: [] });
  });

  it('throws when there is no object at all', () => {
    expect(() => extractJson('I could not find anything.')).toThrow();
  });
});

describe('parseResearchResult', () => {
  it('accepts a well-formed candidate unchanged', () => {
    const result = parseResearchResult({ candidates: [good], sources: ['https://example.ac.kr'] }, 2027);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      level: 'BACHELOR',
      month: 3,
      applicationDeadline: '2026-11-15',
      confidence: 'HIGH',
    });
    expect(result.sources).toEqual(['https://example.ac.kr']);
  });

  it('rejects a payload that is not the expected envelope', () => {
    expect(() => parseResearchResult({ nope: true }, 2027)).toThrow(IntakeResearchParseError);
    expect(() => parseResearchResult('a string', 2027)).toThrow(IntakeResearchParseError);
  });

  // One bad round should not cost the reviewer the other three.
  it('drops a malformed candidate and keeps the rest', () => {
    const result = parseResearchResult(
      { candidates: [{ ...good, month: 5 }, good, { level: 'NOPE', year: 2027, month: 3 }] },
      2027,
    );

    expect(result.candidates).toHaveLength(1);
  });

  it('turns a date that is not a real day into null', () => {
    const result = parseResearchResult(
      { candidates: [{ ...good, applicationDeadline: '2027-02-31', openAt: 'сарын сүүл' }] },
      2027,
    );

    expect(result.candidates[0]?.applicationDeadline).toBeNull();
    expect(result.candidates[0]?.openAt).toBeNull();
  });

  // A model that is sure but cannot say where it read it is stating an
  // opinion; the reviewer must see that difference.
  it('caps confidence at MEDIUM when the candidate cites no source', () => {
    const result = parseResearchResult({ candidates: [{ ...good, sourceUrl: null }] }, 2027);

    expect(result.candidates[0]?.confidence).toBe('MEDIUM');
  });

  it('falls back to LOW when confidence is missing or unrecognised', () => {
    const result = parseResearchResult({ candidates: [{ ...good, confidence: 'VERY SURE' }] }, 2027);

    expect(result.candidates[0]?.confidence).toBe('LOW');
  });

  it('pins the year we asked for when the model omits it', () => {
    const { year, ...withoutYear } = good;
    void year;
    const result = parseResearchResult({ candidates: [withoutYear] }, 2027);

    expect(result.candidates[0]?.year).toBe(2027);
  });

  it('drops out-of-range numbers rather than storing a nonsense quota', () => {
    const result = parseResearchResult({ candidates: [{ ...good, quota: -5, admissionFeeKrw: 99_000_000 }] }, 2027);

    expect(result.candidates[0]?.quota).toBeNull();
    expect(result.candidates[0]?.admissionFeeKrw).toBeNull();
  });

  it('ignores sources that are not http(s) URLs', () => {
    const result = parseResearchResult(
      { candidates: [good], sources: ['https://ok.ac.kr', 'javascript:alert(1)', 'not a url'] },
      2027,
    );

    expect(result.sources).toEqual(['https://ok.ac.kr']);
  });
});
