import { describe, expect, it } from 'vitest';
import { extractJson, findGroundingRedirects } from './gemini.service.js';
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

  it('reads a bare array with a sentence in front of it', () => {
    expect(extractJson('Here is what I found:\n[{"level":"BACHELOR"}] ...')).toEqual([{ level: 'BACHELOR' }]);
  });

  // The reported failure: a reply that is two JSON documents, which
  // `JSON.parse` rejects with "Unexpected non-whitespace character after JSON".
  it('reads a reply written as two documents', () => {
    expect(extractJson('{"candidates":[{"month":3}]}\n{"candidates":[{"month":9}]}')).toEqual([
      { candidates: [{ month: 3 }] },
      { candidates: [{ month: 9 }] },
    ]);
  });

  it('reads an object with a closing remark after it', () => {
    expect(extractJson('{"candidates":[]}\n\nАлбан ёсны хуудсаас дахин шалгана уу.')).toEqual({
      candidates: [],
    });
  });

  it('reads both of two fenced documents', () => {
    expect(extractJson('```json\n{"a":1}\n```\ntext\n```json\n{"b":2}\n```')).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  // A brace inside a note or a URL is text, not structure.
  it('is not confused by a brace inside a string', () => {
    expect(extractJson('{"note":"} { хаалт"}\nтайлбар')).toEqual({ note: '} { хаалт' });
  });

  it('throws when there is no object at all', () => {
    expect(() => extractJson('I could not find anything.')).toThrow();
  });

  // Truncated output is a different failure, and it must stay a failure —
  // half a candidate list is not a calendar.
  it('throws on an unterminated object', () => {
    expect(() => extractJson('{"candidates":[{"month":3}')).toThrow();
  });
});

describe('findGroundingRedirects', () => {
  // A JSON-shaped reply comes back with no `groundingMetadata` at all, so the
  // inlined redirect is the only evidence left that the search ran.
  const redirect = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE_x-y=';

  it('finds the links the grounding runtime minted', () => {
    expect(findGroundingRedirects(`{"sources":["${redirect}","https://yskli.com/a"]}`)).toEqual([redirect]);
  });

  it('finds nothing in a reply written without searching', () => {
    expect(findGroundingRedirects('{"sources":["https://www.yonsei.ac.kr"]}')).toEqual([]);
  });
});

describe('parseResearchResult', () => {
  // What the two-document reply must end up as: one list, nothing lost.
  it('folds a reply that arrived as two documents', () => {
    const reply = `{"candidates":[${JSON.stringify(good)}],"sources":["https://example.ac.kr/a"]}
{"candidates":[${JSON.stringify({ ...good, month: 9 })}]}`;

    const result = parseResearchResult(extractJson(reply), 2027);

    expect(result.candidates.map((entry) => entry.month)).toEqual([3, 9]);
    expect(result.sources).toEqual(['https://example.ac.kr/a']);
  });

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

  // `gemini-3.1-flash-lite` answers with the list and no wrapper more often than not.
  it('accepts a bare candidate array as the envelope', () => {
    const result = parseResearchResult([good], 2027);

    expect(result.candidates).toHaveLength(1);
    expect(result.sources).toEqual([]);
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
  // Google's grounding trail is the only claim the model cannot author, so an
  // empty one outranks whatever confidence and sourceUrl the reply asserted.
  it('caps every candidate at LOW when the reply was not grounded', () => {
    const result = parseResearchResult({ candidates: [good] }, 2027, { grounded: false });

    expect(result.candidates[0]?.confidence).toBe('LOW');
    expect(result.candidates[0]?.note).toContain('Google хайлт хийгдээгүй');
    // The citation it wrote down is kept — a reviewer still wants to open it.
    expect(result.candidates[0]?.sourceUrl).toBe('https://example.ac.kr/admissions');
  });

  it('keeps the model note alongside the ungrounded warning', () => {
    const result = parseResearchResult({ candidates: [{ ...good, note: 'Хугацаа тодорхойгүй.' }] }, 2027, {
      grounded: false,
    });

    expect(result.candidates[0]?.note).toContain('Google хайлт хийгдээгүй');
    expect(result.candidates[0]?.note).toContain('Хугацаа тодорхойгүй.');
  });

  it('leaves a grounded reply alone', () => {
    const result = parseResearchResult({ candidates: [good] }, 2027, { grounded: true });

    expect(result.candidates[0]?.confidence).toBe('HIGH');
    expect(result.candidates[0]?.note).toBeNull();
  });

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
