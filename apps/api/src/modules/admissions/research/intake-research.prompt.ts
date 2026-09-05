import type { ProgramLevel } from '../../../prisma/client.js';

export interface ResearchSubject {
  nameMn: string;
  nameEn: string;
  nameKo: string;
  cityEn: string;
  officialWebsite: string | null;
  year: number;
  levels: ProgramLevel[];
}

const LEVEL_HINTS: Record<ProgramLevel, string> = {
  LANGUAGE_PREP: 'Korean language programme (어학당 / 한국어교육원) — usually four intakes: March, June, September, December',
  BACHELOR: 'Undergraduate / 학부 — usually two intakes: March (spring) and September (fall)',
  MASTER: "Master's / 대학원 석사 — usually two intakes: March and September",
  PHD: 'Doctoral / 대학원 박사 — usually two intakes: March and September',
};

/**
 * The research prompt (1H-10).
 *
 * Four things it is built to prevent, because each one costs the office a
 * student:
 *  - an answer written without searching at all → the search order is the
 *    first instruction and the last, and `parseResearchResult` caps every
 *    candidate at LOW when Google's grounding trail comes back empty;
 *  - a recalled date presented as a found one → every field is nullable and
 *    the model is told to prefer `null` over a guess;
 *  - a date with no provenance → `sourceUrl` and `confidence` are required;
 *  - dates for the wrong school → the Korean name and the official domain are
 *    both pinned in the prompt.
 *
 * The search order needs restating this insistently because the lite models
 * skip it: given a long, well-specified schema they will fill it in from
 * memory and label the result HIGH.
 */
export function buildResearchPrompt(subject: ResearchSubject): string {
  const levels = subject.levels.length
    ? subject.levels
    : (['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'] as ProgramLevel[]);

  return `You are researching the official ${subject.year} admission calendar of a South Korean university for a Mongolian study-abroad agency.

THIS IS A LOOKUP, NOT A RECALL TASK. Before you write anything, RUN GOOGLE
SEARCH — at least one query per level below, in Korean — and read the pages you
find. Korean schools republish their calendar every year and move the dates
when they do, so an intake date remembered from training data is not merely
stale, it is the specific mistake that makes a student miss their round. If you
have not opened a page for a round, you have not found that round.

UNIVERSITY
  Korean name:  ${subject.nameKo}
  English name: ${subject.nameEn}
  City:         ${subject.cityEn}
  Official site: ${subject.officialWebsite ?? '(find it)'}

Search in Korean as well as English — the authoritative pages (입학안내, 모집요강, 어학당 모집) are almost always Korean-only.

FIND, for calendar year ${subject.year}, one entry per intake round per level:
${levels.map((level) => `  - ${level}: ${LEVEL_HINTS[level]}`).join('\n')}

For each round report:
  level                 one of LANGUAGE_PREP, BACHELOR, MASTER, PHD
  year                  ${subject.year}
  month                 the month classes START: 3, 6, 9 or 12
  openAt                first day the school accepts applications (YYYY-MM-DD)
  applicationDeadline   LAST day the school accepts applications (YYYY-MM-DD)
  classStartDate        first day of classes (YYYY-MM-DD)
  resultAnnouncedAt     when the school announces its decision (YYYY-MM-DD)
  quota                 seats in this round, if published
  admissionFeeKrw       application fee in KRW, if published
  requirementNote       admission requirements specific to this round, IN MONGOLIAN
  confidence            HIGH  = read off an official university page for ${subject.year}
                        MEDIUM= read off an official page for a nearby year, or a reliable secondary source
                        LOW    = inferred from the usual Korean academic calendar
  sourceUrl             the exact page the dates came from
  note                  IN MONGOLIAN, what is uncertain and why (or null)

RULES — these matter more than completeness:
  0. SEARCH FIRST, ALWAYS. Every date you report must come from a page you
     opened during this search. Answering from memory is a failed run, and an
     empty search returns an empty "candidates" list — never a remembered one.
  1. NEVER invent a date. If a date is not published, return null for it. A
     null is useful; a wrong deadline makes a student miss their intake.
  2. Report only rounds you found evidence for. Do not pad the list out to a
     full year.
  3. Every entry needs a sourceUrl. If you cannot cite a page, use LOW
     confidence and say so in note.
  4. Dates must be ISO YYYY-MM-DD, in Korea Standard Time.
  5. requirementNote and note are written in Mongolian; everything else is data.

Answer with JSON only, no prose and no markdown fence:
{
  "candidates": [
    {
      "level": "BACHELOR", "year": ${subject.year}, "month": 3,
      "openAt": "2026-09-01", "applicationDeadline": "2026-11-15",
      "classStartDate": "2027-03-02", "resultAnnouncedAt": "2026-12-20",
      "quota": 40, "admissionFeeKrw": 60000,
      "requirementNote": "TOPIK 3, ахлах сургуулийн гэрчилгээ",
      "confidence": "HIGH",
      "sourceUrl": "https://...",
      "note": null
    }
  ],
  "sources": ["https://...", "https://..."]
}

"sources" lists the pages you actually opened. Search now, then answer.`;
}
