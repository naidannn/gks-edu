import { ProgramLevel } from '../../../prisma/client.js';
import type { GeminiAnswer } from './gemini.service.js';
import type { IntakeCandidate } from './intake-candidate.parser.js';

/** Two-digit month/day. */
const pad = (value: number) => String(value).padStart(2, '0');

/**
 * A stand-in for a real grounded search, used while `GEMINI_MOCK` is on (the
 * default, since no API key ships with the repo).
 *
 * It follows the general Korean calendar of gksedu.md §4.1-§4.2 — classes in
 * month M, the school's window closing about two months earlier — so the admin
 * review screen, the "fill the form" step and the deadline arithmetic are all
 * exercisable end to end without a key. Everything comes back `MEDIUM`
 * confidence with a note saying it is a test fixture, so a mock answer can
 * never be mistaken for research.
 */
export function mockResearchAnswer(year: number, levels: ProgramLevel[]): GeminiAnswer {
  const wanted = levels.length ? levels : Object.values(ProgramLevel);

  const candidates: IntakeCandidate[] = wanted.flatMap((level) => {
    // Language prep runs four rounds a year, degree programmes two (§4.1, §4.2).
    const months = level === ProgramLevel.LANGUAGE_PREP ? [3, 6, 9, 12] : [3, 9];

    return months.map((month) => {
      // The window closes at the end of the month two months before classes.
      const deadlineMonth = month - 2;
      const deadlineYear = deadlineMonth > 0 ? year : year - 1;
      const normalisedMonth = deadlineMonth > 0 ? deadlineMonth : deadlineMonth + 12;
      const lastDay = new Date(Date.UTC(deadlineYear, normalisedMonth, 0)).getUTCDate();

      return {
        level,
        year,
        month,
        openAt: `${deadlineYear}-${pad(normalisedMonth)}-01`,
        applicationDeadline: `${deadlineYear}-${pad(normalisedMonth)}-${pad(lastDay)}`,
        classStartDate: `${year}-${pad(month)}-02`,
        resultAnnouncedAt: null,
        quota: null,
        admissionFeeKrw: null,
        requirementNote: null,
        confidence: 'MEDIUM' as const,
        sourceUrl: null,
        note: 'GEMINI_MOCK горим — жинхэнэ судалгаа биш, ерөнхий хуанлиар тооцсон жишээ өгөгдөл.',
      };
    });
  });

  return {
    text: JSON.stringify({ candidates, sources: [] }),
    sources: [],
    promptTokens: null,
    responseTokens: null,
  };
}
