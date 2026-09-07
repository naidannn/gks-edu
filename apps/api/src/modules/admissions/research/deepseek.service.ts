import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeminiAnswer } from './gemini.service.js';

interface DeepseekResponse {
  choices?: {
    message?: { content?: string };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * A minimal DeepSeek client, used for one job: enumerating what a Korean
 * university teaches (1I-07).
 *
 * It is the sibling of `GeminiService` and returns the same `GeminiAnswer`, so
 * the research pipeline does not care which one answered. One field of that
 * answer is always empty here, and deliberately: **`sources`**. DeepSeek has no
 * search grounding, so there is no citation trail the model could not have
 * authored, and every candidate off this provider is capped at LOW with the
 * "answered from memory" note. That is not a downgrade — Gemini's grounding
 * does not fire on this prompt either, so the honest label is the same and the
 * bill is a twentieth (measured on Seoul National University: 62 departments
 * for $0.018 against Pro's 82 for $0.38).
 *
 * With no `DEEPSEEK_API_KEY` the service answers with the caller's fixture, the
 * same arrangement `GEMINI_MOCK` has.
 */
@Injectable()
export class DeepseekService {
  private readonly logger = new Logger(DeepseekService.name);

  constructor(private readonly config: ConfigService) {}

  get isMock(): boolean {
    return this.config.get<boolean>('deepseek.mock') ?? true;
  }

  /**
   * One JSON-only completion.
   *
   * `max_tokens` is the setting that matters. Sixty departments is ~13k output
   * tokens; the provider's 8k default truncates mid-string and the reply cannot
   * be parsed at all, losing every row rather than the last one. A truncated
   * reply is reported as a failure with an instruction a human can act on,
   * because silently returning half a school's departments is how a catalogue
   * ends up quietly incomplete.
   */
  async generateJson(params: { model: string; prompt: string; mockAnswer?: () => GeminiAnswer }): Promise<GeminiAnswer> {
    if (this.isMock) {
      this.logger.log(`[DEEPSEEK_MOCK] ${params.model}: судалгааны хуурамч хариу буцаалаа`);
      if (!params.mockAnswer) throw new ServiceUnavailableException('DeepSeek mock хариу тодорхойлогдоогүй байна.');
      return params.mockAnswer();
    }

    const apiKey = this.config.get<string>('deepseek.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException('DEEPSEEK_API_KEY тохируулаагүй тул интернэтээс судлах боломжгүй.');
    }

    const baseUrl = this.config.get<string>('deepseek.baseUrl');
    const timeoutMs = this.config.get<number>('deepseek.timeoutMs') ?? 300_000;
    const maxTokens = this.config.get<number>('deepseek.maxOutputTokens') ?? 16_384;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: params.model,
        messages: [{ role: 'user', content: params.prompt }],
        // Prices are facts; there is nothing to be creative about.
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new ServiceUnavailableException(`DeepSeek хүсэлт амжилтгүй боллоо: ${response.status} ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as DeepseekResponse;
    const choice = payload.choices?.[0];

    if (choice?.finish_reason === 'length') {
      throw new ServiceUnavailableException(
        'Хариу хэт урт болж таслагдсан тул уншиж чадсангүй. Түвшин тус бүрээр нь тусад нь судлуулна уу.',
      );
    }

    return {
      text: choice?.message?.content ?? '',
      // No grounding exists for this provider — see the class comment.
      sources: [],
      promptTokens: payload.usage?.prompt_tokens ?? null,
      responseTokens: payload.usage?.completion_tokens ?? null,
    };
  }
}
