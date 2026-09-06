import { InstructionLanguage, ProgramLevel } from '../../../prisma/client.js';
import type { GeminiAnswer } from '../../admissions/research/gemini.service.js';
import type { ProgramCandidate } from './program-candidate.parser.js';

/**
 * A stand-in for a real grounded search, used while `GEMINI_MOCK` is on (the
 * default, since no API key ships with the repo).
 *
 * The figures are the shape of real Korean ones — a private university charges
 * roughly ₩3.5-5m a semester, a national one about half that, and 입학금 sits
 * near ₩1m — so the review screen, the tick-and-save step and the study-field
 * matcher are all exercisable end to end without a key. Everything comes back
 * MEDIUM with a note saying it is a fixture, so a mock answer can never be
 * mistaken for research.
 */
export function mockProgramResearchAnswer(year: number, levels: ProgramLevel[]): GeminiAnswer {
  const wanted = levels.length ? levels : Object.values(ProgramLevel);

  const candidates: ProgramCandidate[] = wanted.flatMap((level) => {
    if (level === ProgramLevel.LANGUAGE_PREP) {
      return [
        fixture(level, '한국어교육원 정규과정', 'Korean Language Program', 'korean-language-program', {
          tuitionPerTermKrw: 1_700_000,
          durationYears: 1,
          admissionFeeKrw: 60_000,
          topikLevel: null,
        }),
      ];
    }

    const departments: [string, string, string][] = [
      ['경영학과', 'Business Administration', 'business-administration'],
      ['마케팅전공', 'Marketing', 'marketing'],
      ['컴퓨터공학과', 'Computer Engineering', 'computer-science'],
      ['호텔경영학과', 'Hotel Management', 'hotel-management'],
    ];

    return departments.map(([nameKo, nameEn, fieldSlug]) =>
      fixture(level, nameKo, nameEn, fieldSlug, {
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
    fieldSlug: string,
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
      fieldSlug,
      faculty: null,
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
