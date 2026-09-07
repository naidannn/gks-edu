import type { ProgramLevel } from '../../../prisma/client.js';

export interface ProgramResearchSubject {
  nameMn: string;
  nameEn: string;
  nameKo: string;
  cityEn: string;
  officialWebsite: string | null;
  year: number;
  levels: ProgramLevel[];
}

const LEVEL_HINTS: Record<ProgramLevel, string> = {
  LANGUAGE_PREP: 'Korean language programme (어학당 / 한국어교육원) — one entry for the whole institute, priced per 10-week term',
  BACHELOR: 'Undergraduate departments (학부 / 학과) open to international students',
  MASTER: "Master's departments (대학원 석사과정)",
  PHD: 'Doctoral departments (대학원 박사과정)',
};

/**
 * The programme-and-tuition research prompt.
 *
 * It is the sibling of `intake-research.prompt.ts` and is built against the
 * same four failures, with one of its own. Tuition is a number a client is
 * quoted and then held to, so:
 *  - an answer written without searching → the search order is first and last,
 *    and every candidate is capped at LOW when the grounding trail is empty;
 *  - a remembered price presented as a found one → every field is nullable and
 *    `null` is explicitly preferred to a guess;
 *  - a price with no year on it → `tuitionYear` is required reasoning, because
 *    Korean schools republish fees annually and a two-year-old figure looks
 *    exactly like a current one;
 *  - a per-semester figure reported as annual → the two are asked for
 *    separately, in the units the school publishes, and the model is told not
 *    to convert between them.
 */
export function buildProgramResearchPrompt(subject: ProgramResearchSubject): string {
  const levels = subject.levels.length
    ? subject.levels
    : (['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'] as ProgramLevel[]);

  return `You are researching what a South Korean university teaches and what it charges, for a Mongolian study-abroad agency that quotes these figures to clients.

THIS IS A LOOKUP, NOT A RECALL TASK. Before you write anything, RUN GOOGLE
SEARCH — in Korean — and read the pages you find. Korean universities publish a
tuition table (등록금 / 수업료) every academic year and the numbers move, so a
fee remembered from training data is not merely stale: it is the number our
consultant quotes and the family then budgets against. If you have not opened a
page for a figure, you have not found that figure.

UNIVERSITY
  Korean name:  ${subject.nameKo}
  English name: ${subject.nameEn}
  City:         ${subject.cityEn}
  Official site: ${subject.officialWebsite ?? '(find it)'}

Search Korean pages: 등록금 안내, 학과 소개, 외국인 특별전형 모집요강, 장학금 안내.
The English "admissions" page is usually a summary; the Korean one carries the table.

FIND, for academic year ${subject.year}, the departments open to INTERNATIONAL
students at each of these levels:
${levels.map((level) => `  - ${level}: ${LEVEL_HINTS[level]}`).join('\n')}

A DEPARTMENT IS NOT A COLLEGE. 공과대학, 인문대학 and 사회과학대학 are colleges
(단과대학) and 일반대학원 is the graduate school — none of them is a thing a
student applies to, and none of them belongs in "candidates". They belong in the
"faculty" field of the departments inside them. If a page gives you only the
college, open its 학과 소개 page and list the departments; if you cannot, leave
that college out rather than returning it as a department.

HOW MANY TO EXPECT. A comprehensive Korean university publishes roughly 40-80
undergraduate departments across 8-15 colleges, and a similar number of graduate
ones. Returning four or five for a school that size does not mean the school is
small — it means the list is unfinished. Work college by college through the
school's 학과 안내 / 대학·학과 page until you have covered them all, and if you
had to stop early, say so in the "note" of the last entry.

For each department report:
  level                 one of LANGUAGE_PREP, BACHELOR, MASTER, PHD
  nameKo                the department name exactly as the school writes it (경영학과)
  nameEn                the school's own English name for it, if published
  faculty               the college it sits in, EXACTLY as the school writes it
                        (경영대학, 공과대학). Null if the school does not publish
                        one for this department — do not guess a plausible college.
  durationYears         4 for a Korean bachelor, 2 for a master's, and so on
  tuitionPerTermKrw     tuition for ONE SEMESTER in KRW, as published (한 학기 등록금)
  tuitionPerYearKrw     tuition for the YEAR in KRW, only if the school publishes an annual figure
  admissionFeeKrw       입학금, the one-off entrance fee, if published
  tuitionYear           the academic year the tuition table you read is for
  scholarshipMaxPercent the largest tuition discount an international applicant can get, in percent
  scholarshipNote       what that discount depends on, IN MONGOLIAN
  topikLevel            minimum TOPIK level required (1-6), or null if none is stated
  language              KOREAN, ENGLISH or KOREAN_ENGLISH — the language classes are taught in
  confidence            HIGH  = read off an official university page for ${subject.year}
                        MEDIUM= read off an official page for a nearby year, or a reliable secondary source
                        LOW    = inferred
  sourceUrl             the exact page the figures came from
  note                  IN MONGOLIAN, what is uncertain and why (or null)

RULES — these matter more than completeness:
  0. SEARCH FIRST, ALWAYS. Every figure you report must come from a page you
     opened during this search. Answering from memory is a failed run, and an
     empty search returns an empty "candidates" list — never a remembered one.
  1. NEVER invent a number. If a fee is not published, return null. A null
     shows as "мэдээлэл шинэчлэгдэж байна"; a wrong fee is quoted to a family.
  2. Do NOT convert between per-term and per-year. Report each one only if the
     school publishes it in that form. Most Korean schools publish per semester.
  3. Amounts are in KRW, as integers, with no separators or currency symbols.
  4. Do not invent a department. Every entry must be one you saw named on a page
     you opened — but "I only opened one page" is not a reason to stop at five:
     open the department list and work through it. An entry whose name you read
     but whose tuition you could not find is still worth reporting, with null
     prices; a department left out entirely is one nobody can even ask about.
  5. If tuition differs across departments, report each department's own figure.
     If the school publishes one figure per college, repeat it and say so in note.
  6. scholarshipNote and note are written in Mongolian; everything else is data.
  7. Group nothing and rename nothing. One entry per department the school
     lists, under the college the school lists it in.

Answer with JSON only, no prose and no markdown fence:
{
  "candidates": [
    {
      "level": "BACHELOR", "nameKo": "경영학과", "nameEn": "Business Administration",
      "faculty": "경영대학",
      "durationYears": 4,
      "tuitionPerTermKrw": 4200000, "tuitionPerYearKrw": null, "admissionFeeKrw": 990000,
      "tuitionYear": ${subject.year},
      "scholarshipMaxPercent": 50,
      "scholarshipNote": "TOPIK 4-өөс дээш бол эхний улирлын төлбөрийн 50%",
      "topikLevel": 3, "language": "KOREAN",
      "confidence": "HIGH",
      "sourceUrl": "https://...",
      "note": null
    }
  ],
  "sources": ["https://...", "https://..."]
}

"sources" lists the pages you actually opened. Search now, then answer.`;
}
