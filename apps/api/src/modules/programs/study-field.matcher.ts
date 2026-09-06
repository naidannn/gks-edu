/**
 * Filing a school's own wording under a canonical subject.
 *
 * This is the piece that makes "маркетинг" one question. A Korean school
 * writes `경영학과 마케팅전공`, an English prospectus writes
 * `Department of Marketing`, and a consultant types `Маркетинг менежмент` —
 * all three have to land on `marketing`.
 *
 * The method is deliberately dull: strip the words that carry no subject
 * (학과, Department of, тэнхим …), compare what is left against every name and
 * alias in the taxonomy, and take the longest match. No embeddings, no model
 * call: a suggestion that is wrong here is a programme filed under the wrong
 * subject in a catalogue staff search by subject, and a rule a human can read
 * and fix with one alias beats a similarity score nobody can argue with.
 *
 * The matcher only ever *suggests*. Every write path lets a human overrule it,
 * and `matchStudyField` returning `null` is a normal outcome — the programme
 * simply shows up under "ангилаагүй" until somebody says what it is.
 */

export interface MatchableStudyField {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string | null;
  aliases: string[];
  /** Null on a group. Leaves win ties — "Бизнес" is never a better answer than "Маркетинг". */
  parentId: string | null;
}

export interface StudyFieldMatch {
  fieldId: string;
  slug: string;
  /** 0-100+. Everything below `MATCH_THRESHOLD` is discarded, not returned weakly. */
  score: number;
  /** The alias or name that matched, so the admin screen can say why. */
  matchedOn: string;
  /** True when the whole normalised name was the term — not a substring of it. */
  exact: boolean;
}

interface IndexedTerm {
  field: MatchableStudyField;
  /** The normalised alias/name. */
  term: string;
  /** What the user typed, for the explanation. */
  original: string;
}

export type StudyFieldIndex = IndexedTerm[];

/** Below this a match is noise, and "ангилаагүй" is the more honest answer. */
export const MATCH_THRESHOLD = 55;

/**
 * `공학부` and `공학과` are the trap: chopping `학부` off them takes the 학 that
 * belongs to 공학 with it. These two are rewritten before anything else.
 */
const KOREAN_REWRITES: [string, string][] = [
  ['공학부', '공학'],
  ['공학과', '공학'],
  ['대학원', ' '],
  ['학위과정', ' '],
  ['전공심화', ' '],
];

/**
 * Structural suffixes that say where a programme sits, never what it teaches.
 * Stripped only from the END of a word, and only when at least two syllables
 * survive: `경영학과` → `경영`, but `수학과` is left alone, because `수` is not
 * a subject and the substring pass will find `수학` in it anyway.
 */
const KOREAN_SUFFIXES = ['학과', '학부', '전공', '계열', '과정', '트랙', '코스', '전형'];

const LATIN_NOISE = [
  'department of',
  'department',
  'dept',
  'school of',
  'college of',
  'faculty of',
  'division of',
  'graduate school',
  'major in',
  'major',
  'programme',
  'program',
  'course',
  'track',
];

const MONGOLIAN_NOISE = ['тэнхим', 'салбар', 'хөтөлбөр', 'мэргэжил', 'анги'];

const HANGUL = /[가-힯ᄀ-ᇿ㄰-㆏]/;

/**
 * A programme name reduced to its subject.
 *
 *   `경영학과(마케팅전공)` → `경영 마케팅`
 *   `Department of Marketing` → `marketing`
 *   `Маркетингийн тэнхим` → `маркетингийн`
 */
export function normaliseProgramName(value: string): string {
  let text = value.normalize('NFKC').toLowerCase();

  // Brackets become spaces rather than disappearing: the subject is often
  // *inside* them (`경영학과(마케팅)`), and gluing the halves together would
  // hide it from every term.
  text = text.replace(/[()[\]{}<>«»·・,./\\|:;"'’“”_+*=&#@!?~^-]/g, ' ');

  for (const noise of LATIN_NOISE) text = text.replaceAll(noise, ' ');
  for (const noise of MONGOLIAN_NOISE) text = text.replaceAll(noise, ' ');
  for (const [from, to] of KOREAN_REWRITES) text = text.replaceAll(from, to);

  const words = text
    .split(/\s+/)
    .map((word) => stripKoreanSuffixes(word))
    .filter(Boolean);

  return words.join(' ').trim();
}

/** Peels structural suffixes off one word while a real stem is left behind. */
function stripKoreanSuffixes(word: string): string {
  let stem = word;

  for (let peeled = true; peeled; ) {
    peeled = false;
    for (const suffix of KOREAN_SUFFIXES) {
      if (!stem.endsWith(suffix)) continue;
      const shorter = stem.slice(0, -suffix.length);
      // `수학과` → `수` is not a subject; leave the word whole and let the
      // substring pass find `수학` inside it.
      if (shorter.length < 2) continue;
      stem = shorter;
      peeled = true;
      break;
    }
  }

  return stem;
}

/** The shortest a term may be before it is allowed to match inside a name. */
function minimumTermLength(term: string): number {
  // Two hangul syllables are a whole word (`경영`, `수학`); two latin letters
  // are a coincidence waiting to happen.
  return HANGUL.test(term) ? 2 : 4;
}

export function buildStudyFieldIndex(fields: MatchableStudyField[]): StudyFieldIndex {
  const index: StudyFieldIndex = [];

  for (const field of fields) {
    const originals = [field.nameKo, field.nameEn, field.nameMn, ...field.aliases];
    const seen = new Set<string>();

    for (const original of originals) {
      if (!original) continue;
      const term = normaliseProgramName(original);
      if (!term || seen.has(term)) continue;
      seen.add(term);
      index.push({ field, term, original });
    }
  }

  // Longest first, so a scan that keeps the best score naturally prefers
  // `경영정보` over the `경영` sitting inside it.
  return index.sort((a, b) => b.term.length - a.term.length);
}

/**
 * The best canonical subject for one programme, from whatever names we have.
 *
 * `texts` is every wording of the same programme — Korean, English, Mongolian,
 * the school's faculty line. They are scored together and the strongest single
 * match wins: a Korean name that matches exactly beats an English one that
 * merely contains a term.
 */
export function matchStudyField(
  index: StudyFieldIndex,
  texts: (string | null | undefined)[],
): StudyFieldMatch | null {
  const haystacks = texts
    .map((text) => (text ? normaliseProgramName(text) : ''))
    .filter((text) => text.length > 0);
  if (haystacks.length === 0) return null;

  let best: StudyFieldMatch | null = null;

  for (const entry of index) {
    const minimum = minimumTermLength(entry.term);
    if (entry.term.length < minimum) continue;

    for (const haystack of haystacks) {
      let score: number;
      let exact: boolean;

      if (haystack === entry.term) {
        // The name *is* the subject. Nothing beats this.
        score = 100 + entry.term.length;
        exact = true;
      } else if (haystack.includes(entry.term)) {
        // The subject is in there with other words around it. Longer terms are
        // more convincing: `마케팅` inside a name means more than `경영` does.
        score = 60 + Math.min(entry.term.length * 2, 30);
        exact = false;
      } else {
        continue;
      }

      // A leaf is always the better answer than the group above it.
      if (entry.field.parentId !== null) score += 5;

      if (!best || score > best.score) {
        best = { fieldId: entry.field.id, slug: entry.field.slug, score, matchedOn: entry.original, exact };
      }
    }
  }

  return best && best.score >= MATCH_THRESHOLD ? best : null;
}
