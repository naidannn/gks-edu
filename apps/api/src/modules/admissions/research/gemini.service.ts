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
        // Search grounding is the whole point — it turns the call into a lookup.
        tools: [{ google_search: {} }],
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
    const text = (candidate?.content?.parts ?? [])
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
 * Pulls the JSON object out of a model reply.
 *
 * Grounded answers ignore `responseMimeType` often enough that this is the
 * normal path, not a fallback: they come back fenced, or with a sentence in
 * front. Exported for the tests.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Last resort: the outermost {...} or [...] in the reply — whichever opens
    // first, so an unwrapped candidate list is not mistaken for its first entry.
    // The array case is not hypothetical: models routinely drop the envelope and
    // answer with the list alone, which `parseResearchResult` unwraps.
    const object = outermost(candidate, '{', '}');
    const array = outermost(candidate, '[', ']');
    const slice = pickOuter(candidate, object, array);
    if (slice === null) throw new Error('Хариунаас JSON олдсонгүй.');
    return JSON.parse(slice);
  }
}

interface GeminiApiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

function outermost(text: string, open: string, close: string): string | null {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  return start === -1 || end <= start ? null : text.slice(start, end + 1);
}

/** Whichever slice starts earlier in the reply; the other is nested inside it. */
function pickOuter(text: string, object: string | null, array: string | null): string | null {
  if (object === null || array === null) return object ?? array;
  return text.indexOf('{') < text.indexOf('[') ? object : array;
}
