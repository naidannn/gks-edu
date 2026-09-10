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
 *
 * `search: false` (`GEMINI_SEARCH=false` — the request goes out without the
 * search tool) swaps that order for its opposite. It is not a matter of
 * dropping a paragraph: the searching prompt tells the model that an empty
 * search means an empty `candidates` list, so left in place with no tool to
 * run it returns nothing at all. The recall prompt instead asks for the
 * calendar the model knows, forbids HIGH — nothing was read — and asks the
 * uncertainty into `note`, which the reviewer sees. Every candidate still
 * comes back LOW, because no grounding trail reaches `parseResearchResult`.
 */
export function buildResearchPrompt(subject: ResearchSubject, options: { search?: boolean } = {}): string {
  const search = options.search ?? true;
  const levels = subject.levels.length
    ? subject.levels
    : (['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'] as ProgramLevel[]);

  const opening = search
    ? `THIS IS A LOOKUP, NOT A RECALL TASK. Before you write anything, RUN GOOGLE
SEARCH — at least one query per level below, in Korean — and read the pages you
find. Korean schools republish their calendar every year and move the dates
when they do, so an intake date remembered from training data is not merely
stale, it is the specific mistake that makes a student miss their round. If you
have not opened a page for a round, you have not found that round.`
    : `YOU HAVE NO SEARCH TOOL IN THIS RUN, so answer from what you already know
about this university and say plainly how sure you are. Korean schools
republish their calendar every year and move the dates when they do, so
everything you write here is a starting point for a person to verify against
the school's own page — never a date to act on. Do not pretend to have opened a
page, and do not invent one.`;

  return `You are researching the official ${subject.year} admission calendar of a South Korean university for a Mongolian study-abroad agency.

${opening}

UNIVERSITY
  Korean name:  ${subject.nameKo}
  English name: ${subject.nameEn}
  City:         ${subject.cityEn}
  Official site: ${subject.officialWebsite ?? '(find it)'}

${
    search
      ? 'Search in Korean as well as English — the authoritative pages (입학안내, 모집요강, 어학당 모집) are almost always Korean-only.'
      : 'The authoritative pages you are recalling are the Korean ones (입학안내, 모집요강, 어학당 모집); name one in sourceUrl only if you are sure the address is real.'
  }

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
  confidence            ${
    search
      ? `HIGH  = read off an official university page for ${subject.year}
                        MEDIUM= read off an official page for a nearby year, or a reliable secondary source
                        LOW    = inferred from the usual Korean academic calendar`
      : `MEDIUM= you specifically remember this school publishing this round
                        LOW    = inferred from the usual Korean academic calendar
                        never HIGH — you opened no page in this run`
  }
  sourceUrl             ${search ? 'the exact page the dates came from' : 'the page you believe publishes it, or null'}
  note                  IN MONGOLIAN, what is uncertain and why (or null)

RULES — these matter more than completeness:
${
  search
    ? `  0. SEARCH FIRST, ALWAYS. Every date you report must come from a page you
     opened during this search. Answering from memory is a failed run, and an
     empty search returns an empty "candidates" list — never a remembered one.`
    : `  0. SAY WHAT YOU DO NOT KNOW. Every date here is recalled, so give the
     rounds you are reasonably sure this school runs, leave the dates you
     cannot recall as null, and put the doubt in note. A round with a month
     and four nulls is useful; a plausible-looking deadline is not.`
}
  1. NEVER invent a date. If a date is not published, return null for it. A
     null is useful; a wrong deadline makes a student miss their intake.
${
  search
    ? `  2. Report only rounds you found evidence for. Do not pad the list out to a
     full year.
  3. Every entry needs a sourceUrl. If you cannot cite a page, use LOW
     confidence and say so in note.`
    : `  2. Report only rounds you are reasonably sure this school runs. Do not pad
     the list out to a full year.
  3. sourceUrl may be null. A guessed address is worse than none, because the
     reviewer opens it.`
}
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
      "confidence": ${search ? '"HIGH"' : '"MEDIUM"'},
      "sourceUrl": ${search ? '"https://..."' : 'null'},
      "note": ${search ? 'null' : '"Ердийн хуваарь; сургуулийн хуудсаар шалгах шаардлагатай"'}
    }
  ],
  "sources": ${search ? '["https://...", "https://..."]' : '[]'}
}

${
    search
      ? '"sources" lists the pages you actually opened. Search now, then answer.'
      : '"sources" is [] in this run — you opened nothing. Answer now.'
  }`;
}
