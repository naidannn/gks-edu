import { InstructionLanguage, ProgramLevel } from '../../../prisma/client.js';
import type { GeminiAnswer } from '../../admissions/research/gemini.service.js';
import type { ProgramCandidate } from './program-candidate.parser.js';

/**
 * A stand-in for a real grounded search, used while `GEMINI_MOCK` is on (the
 * default, since no API key ships with the repo).
 *
 * The figures are the shape of real Korean ones — a private university charges
 * roughly ₩3.5-5m a semester, a national one about half that, and 입학금 sits
 * near ₩1m — so the review screen and the tick-and-save step, colleges and all,
 * are exercisable end to end without a key. Everything comes back
 * MEDIUM with a note saying it is a fixture, so a mock answer can never be
 * mistaken for research.
 */
export function mockProgramResearchAnswer(year: number, levels: ProgramLevel[]): GeminiAnswer {
  const wanted = levels.length ? levels : Object.values(ProgramLevel);

  const candidates: ProgramCandidate[] = wanted.flatMap((level) => {
    if (level === ProgramLevel.LANGUAGE_PREP) {
      return [
        // A language institute sits under no college, which is the normal case.
        fixture(level, '한국어교육원 정규과정', 'Korean Language Program', null, {
          tuitionPerTermKrw: 1_700_000,
          durationYears: 1,
          admissionFeeKrw: 60_000,
          topikLevel: null,
        }),
      ];
    }

    // Two colleges, so a mock run exercises the "select all and save" path
    // with more than one faculty to create.
    const departments: [string, string, string][] = [
      ['경영학과', 'Business Administration', '경영대학'],
      ['마케팅전공', 'Marketing', '경영대학'],
      ['컴퓨터공학과', 'Computer Engineering', '공과대학'],
      ['호텔경영학과', 'Hotel Management', '경영대학'],
    ];

    return departments.map(([nameKo, nameEn, faculty]) =>
      fixture(level, nameKo, nameEn, faculty, {
        tuitionPerTermKrw: level === ProgramLevel.BACHELOR ? 4_150_000 : 5_300_000,
        durationYears: level === ProgramLevel.BACHELOR ? 4 : level === ProgramLevel.MASTER ? 2 : 3,
        admissionFeeKrw: 990_000,
        topikLevel: level === ProgramLevel.BACHELOR ? 3 : 4,
      }),
    );
  });

  return {
    text: JSON.stringify({ candidates, sources: [] }),
    sources: [],
    promptTokens: null,
    responseTokens: null,
  };

  function fixture(
    level: ProgramLevel,
    nameKo: string,
    nameEn: string,
    faculty: string | null,
    values: {
      tuitionPerTermKrw: number;
      durationYears: number;
      admissionFeeKrw: number;
      topikLevel: number | null;
    },
  ): ProgramCandidate {
    return {
      level,
      nameKo,
      nameEn,
      faculty,
      durationYears: values.durationYears,
      tuitionPerTermKrw: values.tuitionPerTermKrw,
      tuitionPerYearKrw: null,
      admissionFeeKrw: values.admissionFeeKrw,
      tuitionYear: year,
      scholarshipMaxPercent: 30,
      scholarshipNote: 'GEMINI_MOCK — жишээ утга.',
      topikLevel: values.topikLevel,
      language: InstructionLanguage.KOREAN,
      confidence: 'MEDIUM',
      sourceUrl: null,
      note: 'GEMINI_MOCK горим — жинхэнэ судалгаа биш, ерөнхий үнийн жишээ өгөгдөл.',
    };
  }
}
