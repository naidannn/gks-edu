import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AccessLevel } from '../../../prisma/client.js';
import type { RetrievalHit } from '../knowledge/retrieval.service.js';

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
  }): GuardVerdict {
    const leaked = this.detectLeak(params.answer, params.level, params.contextHits, params.playbooks);

    // A citation pointing at nothing is worse than no citation: it is an answer
    // wearing the costume of a sourced one. Observed in the first live run —
    // with no sources retrieved at all, the model still wrote "[K1]".
    const { text: withoutFakes, fabricatedRefs } = stripUnknownRefs(params.answer, params.knownRefs);

    const uncitedFigures = findUncitedFigures(withoutFakes);
    const grounded = uncitedFigures.length === 0 && fabricatedRefs.length === 0;

    let text = withoutFakes.trim();

    if (fabricatedRefs.length > 0) {
      this.logger.warn(`Байхгүй эх сурвалж иш татсан: ${fabricatedRefs.join(', ')}`);
    }

    if (uncitedFigures.length > 0) {
      this.logger.warn(`Ишлэлгүй тоо: ${uncitedFigures.slice(0, 5).join(', ')}`);
      text = `${text}\n\nТоон мэдээллийг зөвлөхөөр баталгаажуулна уу.`;
    }

    return { grounded, leaked, text, uncitedFigures, fabricatedRefs };
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

  const text = answer
    .replace(/\s*\[([KT]\d+)\]/g, (match, ref: string) => {
      if (known.has(ref)) return match;
      fabricated.add(ref);
      return '';
    })
    // Dropping a marker can leave a space before the full stop.
    .replace(/ +([.,!?…])/g, '$1');

  return { text, fabricatedRefs: [...fabricated] };
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
export function findUncitedFigures(answer: string): string[] {
  const uncited: string[] = [];

  for (const sentence of answer.split(/(?<=[.!?…])\s+|\n+/)) {
    if (/\[[KT]\d+\]/.test(sentence)) continue;

    for (const match of sentence.matchAll(FIGURE_PATTERN)) {
      const figure = match[0].trim();
      // A bare small number is ordinary prose ("3 алхам", "2 хувилбар"); what
      // matters is money, percentages, dates and grouped thousands.
      if (figure.length > 0) uncited.push(figure);
    }
  }

  return [...new Set(uncited)];
}

/**
 * Money (`1,200,000₮`, `₩3.5 сая`, `$500`), percentages, four-digit years with a
 * Mongolian date word, ISO dates, and any number with a thousands separator.
 */
const FIGURE_PATTERN =
  /(?:[₮₩$€]\s?\d[\d\s,.]*)|(?:\d[\d\s,.]*\s?(?:₮|₩|\$|€|төгрөг|вон|доллар))|(?:\d+(?:[.,]\d+)?\s?%)|(?:\d{4}\s?(?:он|оны))|(?:\d{4}-\d{2}-\d{2})|(?:\d{1,3}(?:[ ,]\d{3})+)/gu;
