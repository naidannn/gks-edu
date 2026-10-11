import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AccessLevel } from '../../../prisma/client.js';
import type { RetrievalHit } from '../knowledge/retrieval.service.js';
import { OFFICE } from './sales.prompt.js';

/** The longest message a visitor may send (§5.5). */
const MAX_INPUT_CHARS = 2_000;

/** Above this the UI folds the answer behind "дэлгэрэнгүй" rather than regenerating. */
export const LONG_ANSWER_CHARS = 1_200;

/** Matching n-gram length for the leak check. Long enough to be a quotation,
 *  short enough that a paraphrase of one sentence still trips it. */
const NGRAM_WORDS = 8;

export interface GuardVerdict {
  /** True when every figure was cited and every citation was real. */
  grounded: boolean;
  /** Set when the answer quoted material above the caller's level. */
  leaked: boolean;
  /** What the user should see — possibly with a caveat appended. */
  text: string;
  /** For the QA report (§10.4): which figures went uncited. */
  uncitedFigures: string[];
  /** Citation markers pointing at sources that were never supplied. */
  fabricatedRefs: string[];
  /** Phone numbers nobody gave the model, replaced with the office's. */
  inventedPhones: string[];
  /** Tögrög amounts no source, tool or visitor ever said — their sentences are dropped. */
  inventedAmounts: string[];
  /** Tool calls the model wrote out as text instead of making — stripped. */
  fakeToolCalls: string[];
}

/**
 * The checks that run after the model has spoken and before the answer is
 * stored (2B-08, AI-ASSISTANT.md §5.5).
 *
 * Three of the eight principles are enforced here rather than asked for in the
 * prompt, because a prompt is a request and this is a guarantee:
 *
 * - **Nothing above the caller's level is quoted.** The retrieval filter already
 *   means such text was never in the context — but playbooks *are*, on staff
 *   turns, and a future context layer could be careless. This is the second of
 *   the three defences named in §13.
 * - **Every figure carries a citation.** A price or a date the model produced
 *   without a source is the single most damaging thing it can do, because it
 *   sounds exactly like one it read.
 * - **No phone number is made up.** A number the visitor dials is worse than a
 *   wrong price: it reaches a stranger. Every phone in the answer must be the
 *   office's or one that appeared in the conversation, a source or a tool.
 * - **Input is bounded and inert.** 2,000 characters, and no HTML.
 */
@Injectable()
export class GuardService {
  private readonly logger = new Logger(GuardService.name);

  /** Validates and cleans what the visitor sent. */
  sanitiseInput(raw: string): string {
    const text = raw.trim();

    if (text.length === 0) throw new BadRequestException('Мессеж хоосон байна');
    if (text.length > MAX_INPUT_CHARS) {
      throw new BadRequestException(`Мессеж ${MAX_INPUT_CHARS} тэмдэгтээс богино байх ёстой`);
    }

    return (
      text
        // Tags never survive: the answer is rendered as text, and an `<img
        // onerror>` pasted into a chat should not become one anywhere downstream.
        .replace(/<[^>]*>/g, ' ')
        // Control characters, which have no business in a chat message and can
        // upset a terminal, a log line or an SSE frame downstream.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
    );
  }

  /**
   * Checks a finished answer.
   *
   * `contextHits` are the chunks that were actually put in front of the model;
   * `level` is the caller's. Anything in the context above that level is
   * material the answer must not reproduce.
   */
  review(params: {
    answer: string;
    level: AccessLevel;
    contextHits: RetrievalHit[];
    playbooks?: { body: string }[];
    /** The refs actually supplied to the model — `K1`…`Kn`, plus tool refs. */
    knownRefs: string[];
    /**
     * Other text a phone number may legitimately be repeated from: what the
     * visitor wrote, and tool results. `contextHits` are included already.
     */
    sourceTexts?: string[];
  }): GuardVerdict {
    const leaked = this.detectLeak(params.answer, params.level, params.contextHits, params.playbooks);

    // A citation pointing at nothing is worse than no citation: it is an answer
    // wearing the costume of a sourced one. Observed in the first live run —
    // with no sources retrieved at all, the model still wrote "[K1]".
    const { text: withoutFakes, fabricatedRefs } = stripUnknownRefs(params.answer, params.knownRefs);

    const sourceTexts = [...params.contextHits.map((hit) => hit.content), ...(params.sourceTexts ?? [])];

    // The orchestrator already acts on these; this is the guarantee that a
    // `[save_visitor_profile(...)]` never reaches a person whatever path the
    // answer took.
    const { text: withoutFakeCalls, calls } = extractFakeToolCalls(withoutFakes);
    const fakeToolCalls = calls.map((call) => call.name);

    const { text: withoutInventedPhones, inventedPhones } = replaceInventedPhones(withoutFakeCalls, sourceTexts);

    const { text: withoutInventedAmounts, inventedAmounts } = dropInventedAmounts(withoutInventedPhones, sourceTexts);

    const uncitedFigures = findUncitedFigures(withoutInventedAmounts, sourceTexts);
    const grounded =
      uncitedFigures.length === 0 &&
      fabricatedRefs.length === 0 &&
      inventedPhones.length === 0 &&
      inventedAmounts.length === 0 &&
      fakeToolCalls.length === 0;

    let text = withoutInventedAmounts.trim();

    if (fakeToolCalls.length > 0) {
      this.logger.warn(`Хэрэгслийн дуудлагыг текстээр бичсэн: ${fakeToolCalls.join(', ')}`);
    }

    if (inventedAmounts.length > 0) {
      this.logger.error(`Эх сурвалжгүй мөнгөн дүнтэй өгүүлбэрийг хаслаа: ${inventedAmounts.join(', ')}`);
      text = text ? `${text}\n\n${AMOUNT_WITHHELD}` : AMOUNT_WITHHELD;
    }

    if (fabricatedRefs.length > 0) {
      this.logger.warn(`Байхгүй эх сурвалж иш татсан: ${fabricatedRefs.join(', ')}`);
    }

    if (inventedPhones.length > 0) {
      this.logger.error(`Зохиосон утасны дугаарыг ${OFFICE.phone}-аар солив: ${inventedPhones.join(', ')}`);
    }

    if (uncitedFigures.length > 0) {
      this.logger.warn(`Ишлэлгүй тоо: ${uncitedFigures.slice(0, 5).join(', ')}`);
      text = `${text}\n\nТоон мэдээллийг зөвлөхөөр баталгаажуулна уу.`;
    }

    return { grounded, leaked, text, uncitedFigures, fabricatedRefs, inventedPhones, inventedAmounts, fakeToolCalls };
  }

  /**
   * True when the answer reproduces text the caller may not see.
   *
   * Compared as word 8-grams rather than by substring: a model rarely copies a
   * passage verbatim, it rewrites the first few words and keeps going, and a
   * substring check misses exactly that. Punctuation and case are dropped so a
   * comma cannot defeat it.
   */
  private detectLeak(
    answer: string,
    level: AccessLevel,
    hits: RetrievalHit[],
    playbooks: { body: string }[] = [],
  ): boolean {
    const forbidden = [
      ...hits.filter((hit) => isAbove(hit.accessLevel, level)).map((hit) => hit.content),
      // A playbook is never for the client, whatever their level: it is the
      // office's sales tactics, and repeating it is the leak that embarrasses.
      ...(level === AccessLevel.INTERNAL ? [] : playbooks.map((playbook) => playbook.body)),
    ];

    if (forbidden.length === 0) return false;

    const answerGrams = ngrams(answer);
    if (answerGrams.size === 0) return false;

    for (const text of forbidden) {
      for (const gram of ngrams(text)) {
        if (answerGrams.has(gram)) {
          this.logger.error(`Хариулт дээд түвшний баримтаас хуулсан байна: "${gram}"`);
          return true;
        }
      }
    }

    return false;
  }
}

/** Said in place of a price the model made up — the true one is a consultant's to give. */
const AMOUNT_WITHHELD = 'Төлбөрийн яг дүнг зөвлөх баталгаажуулж хэлнэ.';

/** The instruction added on a regenerate after a leak — one more chance, stricter. */
export const NO_QUOTE_INSTRUCTION =
  'ЧУХАЛ: өмнөх оролдлогод чи дотоод баримтаас шууд хуулсан. Дахин бичихдээ дотоод ' +
  'эх сурвалжийн үг хэллэгийг огт бүү ашигла, зөвхөн хэрэглэгчийн түвшинд зөвшөөрөгдсөн ' +
  'ерөнхий мэдээллээр хариул.';

const LEVEL_ORDER: AccessLevel[] = [
  AccessLevel.PUBLIC,
  AccessLevel.REGISTERED,
  AccessLevel.CONTRACTED,
  AccessLevel.INTERNAL,
];

function isAbove(candidate: AccessLevel, level: AccessLevel): boolean {
  return LEVEL_ORDER.indexOf(candidate) > LEVEL_ORDER.indexOf(level);
}

/**
 * Removes citation markers the model invented, and reports them.
 *
 * The marker is dropped rather than the sentence: the prose around it is usually
 * fine and often correct, it simply was not sourced — and the turn is marked
 * ungrounded so the QA report sees it either way.
 */
function stripUnknownRefs(answer: string, knownRefs: string[]): { text: string; fabricatedRefs: string[] } {
  const known = new Set(knownRefs);
  const fabricated = new Set<string>();

  // Any letter, not just K and T: with no sources at all, the model labelled
  // the office's address "[O1]" and it went out on Messenger as written.
  const text = answer
    .replace(/\s*\[([A-Z]{1,2}\d+)\]/g, (match, ref: string) => {
      if (known.has(ref)) return match;
      fabricated.add(ref);
      return '';
    })
    // Dropping a marker can leave a space before the full stop.
    .replace(/ +([.,!?…])/g, '$1');

  return { text, fabricatedRefs: [...fabricated] };
}

/**
 * A Mongolian phone number: eight digits starting 5–9, optionally +976 and
 * split 4-4. Not part of a longer run of digits — a bank account such as
 * "9000 7710 9000" contains two such groups and is not a phone.
 */
const PHONE_PATTERN = /(?<!\d[\s-]?)(?:\+?976[\s-]?)?([5-9]\d{3})[\s-]?(\d{4})(?![\s-]?\d)/g;

/**
 * Replaces every phone number the model was not given with the office's.
 *
 * Replaced rather than removed: the sentence around an invented number is
 * almost always "манай утас …", and the office's number is the right answer to
 * it. Exported for the tests.
 */
export function replaceInventedPhones(
  answer: string,
  sourceTexts: string[],
): { text: string; inventedPhones: string[] } {
  const known = new Set([digitsOf(OFFICE.phone)]);
  for (const source of sourceTexts) {
    for (const match of source.matchAll(PHONE_PATTERN)) known.add(`${match[1]}${match[2]}`);
  }

  const invented = new Set<string>();
  const text = answer.replace(PHONE_PATTERN, (match, head: string, tail: string) => {
    if (known.has(`${head}${tail}`)) return match;
    invented.add(match.trim());
    return OFFICE.phone;
  });

  return { text, inventedPhones: [...invented] };
}

function digitsOf(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Normalised word n-grams, for comparing what was said with what was shown. */
function ngrams(text: string, size = NGRAM_WORDS): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const grams = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) {
    grams.add(words.slice(index, index + size).join(' '));
  }

  return grams;
}

/**
 * Figures in an answer that carry no citation.
 *
 * A figure is money (₮, ₩, $, or a grouped number), a percentage, or a date.
 * "Citation" means a `[K1]`/`[T2]` marker within the same sentence — the model
 * cites at the end of the clause, not immediately after the number.
 *
 * Exported for the tests, because this is the check most likely to be tuned.
 */
export function findUncitedFigures(answer: string, sourceTexts: string[] = []): string[] {
  const uncited: string[] = [];
  const known = numbersIn(sourceTexts);

  for (const sentence of answer.split(/(?<=[.!?…])\s+|\n+/)) {
    if (/\[[KT]\d+\]/.test(sentence)) continue;

    // A phone is not a figure: it is checked on its own, above. Read as one,
    // "9911 2233" is the grouped thousand "11 223", and the footer went under
    // 13 visit confirmations in two days because of the visitor's own number.
    for (const match of sentence.replace(PHONE_PATTERN, ' ').matchAll(FIGURE_PATTERN)) {
      const figure = match[0].trim();
      // A bare small number is ordinary prose ("3 алхам", "2 хувилбар"); what
      // matters is money, percentages, dates and grouped thousands.
      if (figure.length === 0) continue;
      // Said back from somewhere it was given — the visitor's budget, a tool's
      // figure cited a sentence earlier — it is not the model's invention.
      const value = amountValue(figure);
      if (value !== null && known.has(value)) continue;
      uncited.push(figure);
    }
  }

  return [...new Set(uncited)];
}

/**
 * A tögrög amount with its unit: `1,200,000₮`, `1.5 сая төгрөг`, `200 мянган төгрөг`.
 * Won and dollars are left alone — a tuition converted at today's rate is the
 * model's arithmetic on a cited figure, not an invented one.
 */
const TOGROG_PATTERN =
  /(?:₮\s?\d[\d\s,.]*\d|₮\s?\d)|(?:\d[\d,.\s]*?\s?(?:сая|мянга(?:н)?)?\s?(?:₮|төгрөг\p{L}*))/gu;

/** The smallest amount worth checking — below it is a fee nobody quotes by heart. */
const MIN_CHECKED_AMOUNT = 10_000;

/**
 * Removes sentences that state a tögrög amount nobody gave the model.
 *
 * In production the assistant quoted the brokerage fee as 1,500,000₮ with a
 * 500,000₮ prepayment — the real values are 1,200,000₮ and 200,000₮ — and cited
 * it "[T1]", which was the visitor's profile. A citation marker proves nothing
 * about a number; whether the number appears in what the model was handed
 * does. The sentence goes rather than the figure: "нийт төлбөр нь байдаг"
 * reads worse than nothing. Exported for the tests and the orchestrator, which
 * gives the model one chance to look the price up before this runs.
 */
export function findInventedAmounts(answer: string, sourceTexts: string[]): string[] {
  const known = numbersIn(sourceTexts);
  const invented: string[] = [];

  for (const match of answer.replace(PHONE_PATTERN, ' ').matchAll(TOGROG_PATTERN)) {
    const value = amountValue(match[0]);
    if (value === null || value < MIN_CHECKED_AMOUNT) continue;
    if (!known.has(value)) invented.push(match[0].trim());
  }

  return [...new Set(invented)];
}

function dropInventedAmounts(answer: string, sourceTexts: string[]): { text: string; inventedAmounts: string[] } {
  const inventedAmounts = findInventedAmounts(answer, sourceTexts);
  if (inventedAmounts.length === 0) return { text: answer, inventedAmounts };

  const text = answer
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[.!?…])\s+/)
        .filter((sentence) => findInventedAmounts(sentence, sourceTexts).length === 0)
        .join(' '),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return { text, inventedAmounts };
}

/** `1,200,000₮` → 1200000, `1.5 сая` → 1500000, `200 мянган` → 200000; null if it is not one number. */
function amountValue(figure: string): number | null {
  const multiplier = /сая/.test(figure) ? 1_000_000 : /мянга/.test(figure) ? 1_000 : 1;
  const digits = figure.replace(/[^\d.,\s]/g, ' ').trim();
  if (!digits) return null;

  // With a multiplier, "1.5" and "1,5" are decimals; without one, separators group thousands.
  const value =
    multiplier > 1
      ? Number.parseFloat(digits.replace(/\s/g, '').replace(',', '.'))
      : Number.parseInt(digits.replace(/[\s,.]/g, ''), 10);

  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

/** Every number written anywhere in the sources, in the units `amountValue` returns. */
function numbersIn(sourceTexts: string[]): Set<number> {
  const known = new Set<number>();
  for (const source of sourceTexts) {
    for (const match of source.matchAll(/\d[\d,. ]*\d(?:\s?(?:сая|мянга))?|\d(?:\s?(?:сая|мянга))?/g)) {
      const value = amountValue(match[0]);
      if (value !== null) known.add(value);
      // "1,200,000 болон 200,000" is two numbers, not one run of digits.
      for (const part of match[0].split(/\s+/)) {
        const single = amountValue(part);
        if (single !== null) known.add(single);
      }
    }
  }
  return known;
}

/** A tool call the model wrote as prose, parsed back into a name and its arguments. */
export interface FakeToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool calls written into the answer instead of made.
 *
 * gemini-3.1-flash-lite does this now and then — "Таны мэдээллийг тэмдэглэлээ
 * [save_visitor_profile(educationLevel='BACHELOR', goalLevel='MASTER')]" went
 * to a real person seven times in two days, and the profile was never saved.
 * Also caught: a `<tool_result>` block it echoed from the format it is shown.
 *
 * Returns the answer with all of it removed, and the calls parsed so the
 * orchestrator can still carry out the harmless ones.
 */
export function extractFakeToolCalls(answer: string): { text: string; calls: FakeToolCall[] } {
  const calls: FakeToolCall[] = [];

  const text = answer
    .replace(/<tool_(?:result|code|call)[^>]*>[\s\S]*?<\/tool_(?:result|code|call)>/g, ' ')
    .replace(/<\/?tool_(?:result|code|call)[^>]*>/g, ' ')
    .replace(FAKE_CALL_PATTERN, (_match, name: string, args: string) => {
      calls.push({ name, arguments: parseCallArguments(args) });
      return '';
    })
    .replace(/[ \t]+([.,!?…])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();

  return { text: text === answer.trim() ? answer : text, calls };
}

/**
 * `[name(...)]`, `name(...)`, `default_api.name(...)`, `print(name(...))` for a
 * snake_case name of two or more words — what every tool is called, and what
 * no Mongolian sentence contains.
 */
const FAKE_CALL_PATTERN =
  /\s*`?\[?\s*(?:print\(\s*)?(?:default_api\.)?\b([a-z]+(?:_[a-z]+)+)\s*\(([^()]*)\)\s*\)?\s*\]?`?/g;

/** `educationLevel='BACHELOR', gpa=87` → `{ educationLevel: 'BACHELOR', gpa: 87 }`. */
function parseCallArguments(raw: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const match of raw.matchAll(/(\w+)\s*[=:]\s*(?:'([^']*)'|"([^"]*)"|([^,\s)]+))/g)) {
    const [, key, single, double, bare] = match;
    if (single !== undefined || double !== undefined) {
      args[key!] = single ?? double;
    } else if (bare === 'true' || bare === 'True') {
      args[key!] = true;
    } else if (bare === 'false' || bare === 'False') {
      args[key!] = false;
    } else if (bare !== undefined && /^-?\d+(?:\.\d+)?$/.test(bare)) {
      args[key!] = Number(bare);
    } else if (bare !== undefined) {
      args[key!] = bare;
    }
  }

  return args;
}

/**
 * Money (`1,200,000₮`, `₩3.5 сая`, `$500`), percentages, four-digit years with a
 * Mongolian date word, ISO dates, and any number with a thousands separator.
 */
const FIGURE_PATTERN =
  /(?:[₮₩$€]\s?\d[\d\s,.]*)|(?:\d[\d\s,.]*\s?(?:₮|₩|\$|€|төгрөг|вон|доллар))|(?:\d+(?:[.,]\d+)?\s?%)|(?:\d{4}\s?(?:он|оны))|(?:\d{4}-\d{2}-\d{2})|(?:\d{1,3}(?:[ ,]\d{3})+)/gu;
