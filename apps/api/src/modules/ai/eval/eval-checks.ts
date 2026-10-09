/**
 * The checks an answer is held to (2G-02, `AI-SALES-IMPROVEMENT.md` §5).
 *
 * Deliberately plain rules, not a model grading a model: a rule can be read,
 * argued with and changed, and it gives the same verdict on the same text every
 * run — which is what makes a before/after comparison of a prompt edit mean
 * anything. They are heuristics over Mongolian prose, so each one reports the
 * bit of text that tripped it and a human reads the failures; the pass rate is
 * a direction, not a grade.
 */

export interface EvalQuestion {
  id: string;
  text: string;
  topic: string;
  /** Written in Latin letters ("Yonsei University ruu sonirhoj baigaa"). */
  romanised: boolean;
  /** What the office did with it: `staff`, `automation` or `nobody`. */
  answeredBy: string;
  staffReply?: string;
}

export interface EvalAnswer {
  /** Everything the model said, citation markers included. */
  text: string;
  /** The orchestrator's own verdict, `null` if it never got that far. */
  grounded: boolean | null;
  tools: string[];
  /** Set when the assistant refused to answer at all (switched off, budget…). */
  offline?: string;
}

export const CHECK_IDS = [
  'answered',
  'no_dead_end',
  'no_promise',
  'no_uncited_money',
  'ends_with_step',
  'one_ask',
  'cyrillic_reply',
  'short',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export interface CheckResult {
  id: CheckId;
  pass: boolean;
  /** The text that failed, so the report can be read without re-running. */
  evidence?: string;
}

const CITATION = /\[(?:K|T)\d+\]/;
const CITATIONS = new RegExp(CITATION.source, 'g');

const stripCitations = (text: string) => text.replace(CITATIONS, '').replace(/\s+/g, ' ').trim();

/** Sentences, roughly: Mongolian prose ends on . ! ? and so does most of what the model writes. */
const rawSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const DEAD_END = /түр хүлээнэ үү|удахгүй холбогдо/i;

// "Заавал тэнцэнэ", "виз 100%": the promises rule 10 of the policy forbids.
const PROMISE =
  /заавал тэнц|тэнцэнэ|баталгаатай виз|виз[^.!?]{0,25}100\s*%|100\s*%[^.!?]{0,25}виз/i;

// An amount of money or a count of years/weeks does not need a citation; money does.
const MONEY = /\d[\d.,\s]*\s*(?:сая|мянга|₮|төгрөг|вон|krw)/i;

// Something the visitor can do next: meet, call, leave a number, pick, register.
const STEP =
  /уулз|цаг|залг|дугаар|утас|бүртгүүл|ирж|очиж|илгээ|хэлээрэй|бичээрэй|үлдээ|хэлбэл|хэлнэ үү|сонго|санал болго/i;

const MAX_CHARS = 900;

export function runChecks(question: EvalQuestion, answer: EvalAnswer): CheckResult[] {
  const body = stripCitations(answer.text);
  const raw = rawSentences(answer.text);
  const parts = raw.map(stripCitations).filter(Boolean);
  const results: CheckResult[] = [];

  const add = (id: CheckId, pass: boolean, evidence?: string) =>
    results.push({ id, pass, ...(pass || !evidence ? {} : { evidence: evidence.slice(0, 200) }) });

  add('answered', !answer.offline && body.length >= 20, answer.offline ?? (body || '(хоосон)'));

  add('no_dead_end', !DEAD_END.test(body), body.match(DEAD_END)?.[0]);

  add('no_promise', !PROMISE.test(body), body.match(PROMISE)?.[0]);

  const uncited = raw.find(
    (sentence) => MONEY.test(stripCitations(sentence)) && !CITATION.test(sentence),
  );
  add('no_uncited_money', !uncited, uncited);

  const last = parts[parts.length - 1] ?? '';
  // A numbered list of choices is a step even though its last line is just an option's name.
  const offersOptions = /(?:^|\s)1\.\s+\S[\s\S]*(?:^|\s)2\.\s+\S/.test(answer.text);
  add('ends_with_step', last.includes('?') || STEP.test(last) || offersOptions, last || '(хоосон)');

  const asks = (body.match(/\?/g) ?? []).length;
  add('one_ask', asks <= 1, `${asks} асуулт: ${body}`);

  if (question.romanised) {
    const clean = body.replace(/https?:\S+/g, '');
    const cyrillic = (clean.match(/[А-Яа-яӨөҮүЁё]/g) ?? []).length;
    const latin = (clean.match(/[A-Za-z]/g) ?? []).length;
    add('cyrillic_reply', cyrillic + latin === 0 || cyrillic / (cyrillic + latin) >= 0.7, body);
  } else {
    add('cyrillic_reply', true);
  }

  add('short', body.length <= MAX_CHARS, `${body.length} тэмдэгт`);

  return results;
}
