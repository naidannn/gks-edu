import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A link the grounding runtime minted for a result it actually fetched. */
const GROUNDING_REDIRECT = /https:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[\w=-]+/g;

export interface GeminiAnswer {
  /** The model's text, expected to be the JSON object the prompt asked for. */
  text: string;
  /**
   * URLs the grounding step actually retrieved — the citation trail, and the
   * only part of a reply the model does not author. Empty means the search
   * never ran, whatever the answer claims.
   */
  sources: string[];
  promptTokens: number | null;
  responseTokens: number | null;
}

/**
 * A minimal Gemini REST client, used for one job: reading a Korean
 * university's published intake calendar off the web (1H-10).
 *
 * Google is the only provider wired, and Search grounding is the reason —
 * without it the model is recalling a training set, and an intake deadline
 * recalled from memory is worse than no deadline at all.
 *
 * `GEMINI_SEARCH=false` drops the search tool anyway, because grounding is
 * billed per search query and an account with no grounding quota answers every
 * grounded call with a 429 — no search *and* no dates. What the flag buys is a
 * recalled calendar the reviewer is told to verify: the prompt loses its search
 * order (`buildResearchPrompt`), the reply carries no grounding trail, and
 * `parseResearchResult` therefore caps every candidate at LOW and prefixes the
 * note that says so. It is the degraded mode, not the intended one; turn it
 * back on when the Google project has grounding quota again.
 *
 * With no `GEMINI_API_KEY` the service answers with a fixture instead of
 * calling Google, so the admin screen and its review flow are exercisable in
 * dev. Same arrangement as `QPAY_MOCK` (`qpay-client.service.ts`).
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);

  constructor(private readonly config: ConfigService) {}

  get isMock(): boolean {
    return this.config.get<boolean>('gemini.mock') ?? true;
  }

  /** Whether requests carry the Google Search tool. See the class comment. */
  get isSearchEnabled(): boolean {
    return this.config.get<boolean>('gemini.search') ?? true;
  }

  /**
   * One grounded, JSON-only completion.
   *
   * `responseMimeType: application/json` is asked for but never trusted —
   * grounded replies routinely arrive fenced in markdown, so the caller runs
   * the text through `extractJson` and then through zod.
   */
  async generateJson(params: { model: string; prompt: string; mockAnswer?: () => GeminiAnswer }): Promise<GeminiAnswer> {
    if (this.isMock) {
      this.logger.log(`[GEMINI_MOCK] ${params.model}: судалгааны хуурамч хариу буцаалаа`);
      if (!params.mockAnswer) throw new ServiceUnavailableException('Gemini mock хариу тодорхойлогдоогүй байна.');
      return params.mockAnswer();
    }

    const apiKey = this.config.get<string>('gemini.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY тохируулаагүй тул интернэтээс судлах боломжгүй.');
    }

    const baseUrl = this.config.get<string>('gemini.baseUrl');
    const timeoutMs = this.config.get<number>('gemini.timeoutMs') ?? 120_000;

    const response = await fetch(`${baseUrl}/models/${params.model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
        // Search grounding is what turns the call into a lookup. Omitted, not
        // sent empty: `tools: []` is still a tool-use request to Google and
        // spends the same exhausted quota.
        ...(this.isSearchEnabled ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          // Dates are facts; there is nothing to be creative about.
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableException(`Gemini хүсэлт амжилтгүй боллоо: ${response.status} ${body.slice(0, 300)}`);
    }

    return this.parseResponse((await response.json()) as GeminiApiResponse);
  }

  private parseResponse(payload: GeminiApiResponse): GeminiAnswer {
    const candidate = payload.candidates?.[0];
    // `thought` parts are the model's own reasoning, not its answer. They are
    // prose, they sometimes contain a draft of the JSON, and joining them onto
    // the answer is what turns one reply into two JSON documents.
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const cited = chunks.map((chunk) => chunk.web?.uri).filter((uri): uri is string => Boolean(uri));

    // Google returns `groundingMetadata` only for a prose answer it can
    // annotate; ask for JSON — as the research prompt does — and the field
    // comes back empty even though the search ran. What survives either way is
    // the redirect link, which the grounding runtime mints and hands to the
    // model. It cannot be written from memory, so finding one is the proof
    // that the tool ran, and its absence is what `IntakeResearchService`
    // marks a run down for.
    const sources = [...new Set([...cited, ...findGroundingRedirects(text)])];

    return {
      text,
      sources,
      promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
      responseTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
}

/** The grounding links inlined in a reply. Exported for the tests. */
export function findGroundingRedirects(text: string): string[] {
  return text.match(GROUNDING_REDIRECT) ?? [];
}

/**
 * Pulls the JSON out of a model reply.
 *
 * Grounded answers ignore `responseMimeType` often enough that this is the
 * normal path, not a fallback: they come back fenced, or with a sentence in
 * front, or — intermittently, which is what makes it a support ticket rather
 * than a broken build — as *two* documents, the asked-for object followed by
 * a second one, a repeat, or a closing remark. `JSON.parse` on that says
 * "Unexpected non-whitespace character after JSON", and slicing from the first
 * brace to the last one keeps both halves and fails the same way.
 *
 * So the reply is scanned for every complete, balanced JSON value in it and
 * the unparseable text between them is dropped. One value is returned as
 * itself; several are returned as a list, which `parseResearchResult` folds
 * back into one envelope — a round the model reported in its second document
 * is still a round. Exported for the tests.
 */
export function extractJson(text: string): unknown {
  const values = extractJsonValues(text);
  if (values.length === 0) throw new Error('Хариунаас JSON олдсонгүй.');
  return values.length === 1 ? values[0] : values;
}

/** Every complete JSON value in a reply, in the order it was written. */
export function extractJsonValues(text: string): unknown[] {
  const fenced = fencedBlocks(text);
  const values = (fenced.length > 0 ? fenced : [text.trim()]).flatMap(jsonValuesIn);
  // A fence the model opened around something that is not JSON should not hide
  // the JSON written outside it.
  return values.length > 0 || fenced.length === 0 ? values : jsonValuesIn(text.trim());
}

interface GeminiApiResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/** Every ```-fenced block in a reply — models fence each document separately. */
function fencedBlocks(text: string): string[] {
  return [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
    .map((match) => (match[1] ?? '').trim())
    .filter(Boolean);
}

function jsonValuesIn(chunk: string): unknown[] {
  const whole = tryParse(chunk);
  if (whole) return [whole.value];

  return balancedSlices(chunk)
    .map(tryParse)
    .filter((parsed): parsed is { value: unknown } => parsed !== null)
    .map((parsed) => parsed.value);
}

function tryParse(text: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(text) };
  } catch {
    return null;
  }
}

/**
 * The `{...}` / `[...]` runs in a string, each one balanced. Quoted braces do
 * not count — a `sourceUrl` or a Mongolian note is free to contain one.
 */
function balancedSlices(text: string): string[] {
  const slices: string[] = [];

  for (let index = 0; index < text.length; ) {
    const start = nextOpener(text, index);
    if (start === -1) break;

    const end = matchingClose(text, start);
    if (end === -1) break;

    slices.push(text.slice(start, end + 1));
    index = end + 1;
  }

  return slices;
}

function nextOpener(text: string, from: number): number {
  const object = text.indexOf('{', from);
  const array = text.indexOf('[', from);
  if (object === -1 || array === -1) return Math.max(object, array);
  return Math.min(object, array);
}

/** The index of the bracket closing the one at `start`, or -1 if it never closes. */
function matchingClose(text: string, start: number): number {
  const expected: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === '{') expected.push('}');
    else if (char === '[') expected.push(']');
    else if (char === '}' || char === ']') {
      if (expected.pop() !== char) return -1;
      if (expected.length === 0) return index;
    }
  }

  return -1;
}
