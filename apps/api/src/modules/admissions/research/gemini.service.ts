import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GeminiAnswer {
  /** The model's text, expected to be the JSON object the prompt asked for. */
  text: string;
  /** URLs the grounding step actually retrieved — the citation trail. */
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
    const sources = [...new Set(chunks.map((chunk) => chunk.web?.uri).filter((uri): uri is string => Boolean(uri)))];

    return {
      text,
      sources,
      promptTokens: payload.usageMetadata?.promptTokenCount ?? null,
      responseTokens: payload.usageMetadata?.candidatesTokenCount ?? null,
    };
  }
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
    // Last resort: the outermost {...} in the reply.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error('Хариунаас JSON олдсонгүй.');
    return JSON.parse(candidate.slice(start, end + 1));
  }
}

interface GeminiApiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string } }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}
