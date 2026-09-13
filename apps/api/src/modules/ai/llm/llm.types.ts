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
  | { type: 'usage'; promptTokens: number; completionTokens: number }
  | { type: 'done'; finishReason: LlmFinishReason };

export interface LlmProvider {
  readonly name: 'gemini' | 'deepseek';
  stream(request: LlmChatRequest): AsyncIterable<LlmEvent>;
}

/**
 * List prices, USD per million tokens, for the models this app is configured
 * with. Used to turn a usage count into `ChatSession.costMicros` so the daily
 * ceiling (§13) is spent in money rather than in tokens nobody can price.
 *
 * A model missing from this table is billed at the default rather than free —
 * an unpriced model silently costing nothing is how a budget stops working.
 */
export const MODEL_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.1-flash': { input: 0.5, output: 3 },
  'gemini-embedding-001': { input: 0.15, output: 0 },
  'deepseek-v4-flash': { input: 0.28, output: 0.42 },
};

const DEFAULT_PRICE = { input: 0.5, output: 3 };

/** Cost of one call in USD × 1e6, rounded up — never reported as zero. */
export function costMicros(model: string, promptTokens: number, completionTokens: number): number {
  const price = MODEL_PRICES_USD_PER_MTOK[model] ?? DEFAULT_PRICE;
  const usd = (promptTokens * price.input + completionTokens * price.output) / 1_000_000;

  return Math.ceil(usd * 1_000_000);
}
