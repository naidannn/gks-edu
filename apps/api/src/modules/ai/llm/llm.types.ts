/**
 * The shape every provider is bent into (2B-01).
 *
 * Two providers answer this app — Gemini and DeepSeek — and the orchestrator
 * (2B-04) must not care which. What they genuinely share is a stream of text
 * deltas, a set of tool calls, and a token count at the end; everything else
 * about their wire formats is provider detail and stays inside the adapters.
 */

export type LlmRole = 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  /** Provider-supplied id where there is one, else a generated one — the tool
   *  result has to be matched back to its call. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /**
   * An opaque provider token that must be echoed back with the call.
   *
   * Gemini 3 requires it: a tool conversation continued without the
   * `thoughtSignature` it minted is rejected outright with
   * "Function call is missing a thought_signature". Other providers have no such
   * thing and ignore it, which is why it lives here rather than in the adapter.
   */
  signature?: string;
}

export interface LlmMessage {
  role: LlmRole;
  content: string;
  /**
   * The model's own thinking trace, echoed back on the next call.
   *
   * The message-level twin of `LlmToolCall.signature`, and required for the
   * same reason by the other provider: DeepSeek in thinking mode refuses a
   * continued tool conversation with "The `reasoning_content` in the thinking
   * mode must be passed back to the API". Opaque, never shown, never stored
   * with the answer — it belongs to one turn's wire format.
   */
  reasoning?: string;
  /** ASSISTANT turns that asked for tools. */
  toolCalls?: LlmToolCall[];
  /** TOOL turns: which call this answers. */
  toolCallId?: string;
  /** TOOL turns: the tool's name, which Gemini needs and OpenAI-style APIs like. */
  name?: string;
}

/** A tool as the model sees it: a name, a sentence, and a JSON Schema. */
export interface LlmToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object — the subset both providers accept. */
  parameters: Record<string, unknown>;
}

export interface LlmChatRequest {
  model: string;
  /** The system prompt. Layered by `prompt.builder.ts` (2B-05). */
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  /** Abort signal, so a client hanging up stops the upstream call too. */
  signal?: AbortSignal;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'length' | 'error';

export type LlmEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; call: LlmToolCall }
  | {
      type: 'usage';
      promptTokens: number;
      /** Billed output, the thinking trace included — both providers charge for it as output. */
      completionTokens: number;
      /** The part of `promptTokens` served from the provider's prompt cache, billed at a tenth or less. */
      cachedPromptTokens?: number;
      /** The part of `completionTokens` that was thinking, never shown. */
      reasoningTokens?: number;
    }
  | { type: 'done'; finishReason: LlmFinishReason; reasoning?: string };

export interface LlmProvider {
  readonly name: 'gemini' | 'deepseek';
  stream(request: LlmChatRequest): AsyncIterable<LlmEvent>;
}

/**
 * List prices, USD per million tokens, for the models this app is configured
 * with. Used to turn a usage count into `ChatSession.costMicros` so the daily
 * ceiling (§13) is spent in money rather than in tokens nobody can price.
 *
 * `cached` is the price of an input token the provider served from its prompt
 * cache — a tenth of `input` on Gemini, a fiftieth on DeepSeek. Both cache on
 * their own, and on Messenger 40-77% of the input is a hit (measured against
 * the AI Studio bill, 2026-10-11): pricing it at `input` made our figure 1.8×
 * what Google charged.
 *
 * DeepSeek prices are its peak rate, the office's busy hours; off-peak is half.
 * Checked 2026-10-11. A model missing from this table is billed at the default
 * rather than free — an unpriced model silently costing nothing is how a
 * budget stops working.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; cached: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, cached: 0.025, output: 1.5 },
  'gemini-3.1-flash': { input: 0.5, cached: 0.05, output: 3 },
  'gemini-embedding-001': { input: 0.15, cached: 0.15, output: 0 },
  // `deepseek-v4-flash` is a retired alias, served by and billed as `deepseek-flash` (V4.1).
  'deepseek-flash': { input: 0.3, cached: 0.006, output: 1.2 },
  'deepseek-v4-flash': { input: 0.3, cached: 0.006, output: 1.2 },
  'deepseek-v4-pro': { input: 1.32, cached: 0.044, output: 3.96 },
};

const DEFAULT_PRICE = { input: 0.5, cached: 0.5, output: 3 };

/**
 * Cost of one call in USD × 1e6, rounded up — never reported as zero.
 * `cachedPromptTokens` is the part of `promptTokens` that was a cache hit.
 */
export function costMicros(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedPromptTokens = 0,
): number {
  const price = MODEL_PRICES_USD_PER_MTOK[baseModel(model)] ?? DEFAULT_PRICE;
  const cached = Math.min(cachedPromptTokens, promptTokens);
  const usd = ((promptTokens - cached) * price.input + cached * price.cached + completionTokens * price.output) / 1_000_000;

  return Math.ceil(usd * 1_000_000);
}

/**
 * A DeepSeek model id may carry a thinking mode after a colon —
 * `deepseek-flash:nothink`, `deepseek-flash:low` — so the mode can be picked
 * from the admin config like any other model. This is the id the API knows.
 */
export function baseModel(model: string): string {
  return model.split(':')[0]!;
}
