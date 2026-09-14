import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConfigService } from '../ai-config.service.js';
import { DeepseekChatProvider } from './providers/deepseek.provider.js';
import { GeminiChatProvider, LlmStreamError } from './providers/gemini.provider.js';
import { costMicros, type LlmChatRequest, type LlmEvent, type LlmProvider } from './llm.types.js';

export interface LlmTurnResult {
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  costMicros: number;
  /** True when the primary model failed and the fallback answered. */
  usedFallback: boolean;
}

/**
 * The one place that talks to a language model (2B-01).
 *
 * Three jobs, and no more: pick the provider from the model name (a `deepseek-`
 * prefix routes to DeepSeek, anything else to Gemini — the rule 1H-16 already
 * established), fall back once when the primary provider fails, and count what
 * the call cost.
 *
 * **The fallback rule is narrow on purpose.** It fires only on a retriable
 * status (429, 5xx) and only if *nothing has been streamed yet*. Once a token
 * has reached the browser the answer is half-written; starting a second model on
 * the same question would splice two voices into one reply, which reads as a
 * malfunction even when both halves are correct.
 *
 * With no API key at all the service answers with a fixed sentence instead of
 * throwing, the same arrangement `QPAY_MOCK` has: the chat is then visibly
 * useless rather than invisibly broken, and every other part of the turn —
 * retrieval, streaming, storage, the sales loop — stays exercisable in dev.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly aiConfig: AiConfigService,
    private readonly gemini: GeminiChatProvider,
    private readonly deepseek: DeepseekChatProvider,
  ) {}

  /** True when no provider has a key — the assistant will answer with a stub. */
  get isMock(): boolean {
    return !this.config.get<string>('gemini.apiKey') && !this.config.get<string>('deepseek.apiKey');
  }

  providerFor(model: string): LlmProvider {
    return AiConfigService.providerFor(model) === 'deepseek' ? this.deepseek : this.gemini;
  }

  /**
   * Streams one model turn, yielding provider events as they arrive.
   *
   * The caller gets a `result` promise alongside the stream rather than a
   * summary at the end of it, because the usage numbers arrive *during* the
   * stream and the orchestrator needs them after it: the session's token bill
   * is written once the answer is stored (2B-11).
   */
  async *stream(
    request: Omit<LlmChatRequest, 'model'> & { model?: string },
    onResult?: (result: LlmTurnResult) => void,
  ): AsyncIterable<LlmEvent> {
    const config = await this.aiConfig.get();
    const model = request.model ?? config.chatModel;

    if (this.isMock) {
      yield* this.mockStream(model, onResult);
      return;
    }

    const full: LlmChatRequest = {
      ...request,
      model,
      temperature: request.temperature ?? config.temperature,
      maxOutputTokens: request.maxOutputTokens ?? config.maxOutputTokens,
    };

    let streamed = false;
    let promptTokens = 0;
    let completionTokens = 0;

    const run = async function* (this: LlmService, chosen: string, usedFallback: boolean) {
      const provider = this.providerFor(chosen);

      for await (const event of provider.stream({ ...full, model: chosen })) {
        if (event.type === 'text' && event.delta.length > 0) streamed = true;
        if (event.type === 'usage') {
          promptTokens = event.promptTokens;
          completionTokens = event.completionTokens;
        }
        yield event;
      }

      onResult?.({
        model: chosen,
        provider: provider.name,
        promptTokens,
        completionTokens,
        costMicros: costMicros(chosen, promptTokens, completionTokens),
        usedFallback,
      });
    }.bind(this);

    try {
      yield* run(model, false);
    } catch (error) {
      const retriable = error instanceof LlmStreamError && error.isRetriable;
      const fallback = config.fallbackModel;

      if (!retriable || streamed || !fallback || fallback === model) throw error;

      this.logger.warn(
        `${model} хариулсангүй (${(error as Error).message}) — ${fallback} рүү шилжлээ`,
      );
      yield* run(fallback, true);
    }
  }

  /** The no-key answer: honest, short, and never mistaken for a real reply. */
  private async *mockStream(model: string, onResult?: (result: LlmTurnResult) => void): AsyncIterable<LlmEvent> {
    const text =
      'AI туслах туршилтын горимд ажиллаж байна (загварын түлхүүр тохируулаагүй). ' +
      'Асуултад бодит хариулт өгөхийн тулд зөвлөхтэй холбогдоно уу.';

    yield { type: 'text', delta: text };
    yield { type: 'usage', promptTokens: 0, completionTokens: 0 };
    onResult?.({ model, provider: 'mock', promptTokens: 0, completionTokens: 0, costMicros: 0, usedFallback: false });
    yield { type: 'done', finishReason: 'stop' };
  }
}
