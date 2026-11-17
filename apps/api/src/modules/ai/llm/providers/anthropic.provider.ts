import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sseDataLines } from '../sse-lines.js';
import type { LlmChatRequest, LlmEvent, LlmFinishReason, LlmMessage, LlmProvider } from '../llm.types.js';
import { LlmStreamError } from './gemini.provider.js';

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'thinking' | 'redacted_thinking'; [key: string]: unknown };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicBlock[];
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface AnthropicEvent {
  type: string;
  index?: number;
  message?: { usage?: AnthropicUsage };
  content_block?: { type: string; id?: string; name?: string; [key: string]: unknown };
  delta?: { type?: string; text?: string; partial_json?: string; thinking?: string; signature?: string; stop_reason?: string };
  usage?: AnthropicUsage;
  error?: { type?: string; message?: string };
}

/**
 * Room for the model's thinking on top of the answer.
 *
 * `max_tokens` covers the thinking as well as the reply, and the thinking comes
 * first. At the admin's 700 the first Messenger replies on Haiku 5.5 (2026-11-17)
 * came back empty: the budget went on thinking and no text was left. The answer's
 * own length is limited by the prompt, so the headroom costs only what is thought.
 */
const THINKING_HEADROOM = 2000;

/**
 * Claude, streaming, with tool use.
 *
 * Three things differ from the other two providers and are worth knowing:
 *
 * - **No `temperature`.** Haiku 5.5 rejects any non-default sampling value with a
 *   400, so the admin's temperature setting simply does not apply here.
 * - **Thinking stays on, cheaply.** It cannot be switched off without the model
 *   sometimes writing a tool call as visible text, so the request keeps adaptive
 *   thinking at `low` effort and hides the summary. The thinking blocks carry a
 *   signature the API wants back on the next round of a tool turn; they travel in
 *   `LlmMessage.reasoning` as JSON, the same slot DeepSeek's trace uses.
 * - **Tool results are one user message.** Parallel calls must be answered
 *   together, so consecutive `tool` messages are folded into a single turn.
 */
@Injectable()
export class AnthropicChatProvider implements LlmProvider {
  readonly name = 'anthropic' as const;

  constructor(private readonly config: ConfigService) {}

  async *stream(request: LlmChatRequest): AsyncIterable<LlmEvent> {
    const apiKey = this.config.get<string>('anthropic.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('ANTHROPIC_API_KEY тохируулаагүй байна.');

    const baseUrl = this.config.get<string>('anthropic.baseUrl');
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: request.model,
        max_tokens: (request.maxOutputTokens ?? 700) + THINKING_HEADROOM,
        stream: true,
        // The system prompt is the stable prefix: cached, it is billed at a tenth.
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: toMessages(request.messages),
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.parameters,
              })),
            }
          : {}),
      }),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      let message = body.slice(0, 300);
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message.slice(0, 400);
      } catch {
        // Not JSON — a gateway answered. Keep what it said.
      }
      throw new LlmStreamError(response.status, `Anthropic ${response.status}: ${message}`);
    }

    // Content blocks arrive by index; tool arguments as JSON fragments.
    const tools = new Map<number, { id: string; name: string; args: string }>();
    const thinking = new Map<number, Record<string, unknown>>();
    let finishReason: LlmFinishReason = 'stop';
    let sawToolCall = false;
    let usage: Required<AnthropicUsage> = {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    };

    for await (const payload of readEvents(response.body, request.signal)) {
      const event = JSON.parse(payload) as AnthropicEvent;

      if (event.type === 'error') {
        // An error after the stream opened (overloaded_error is the usual one).
        throw new LlmStreamError(
          event.error?.type === 'overloaded_error' ? 529 : 500,
          `Anthropic ${event.error?.type ?? 'error'}: ${event.error?.message ?? ''}`.slice(0, 400),
        );
      }

      if (event.type === 'message_start') usage = { ...usage, ...event.message?.usage };

      if (event.type === 'content_block_start' && event.index !== undefined && event.content_block) {
        const block = event.content_block;
        if (block.type === 'tool_use') {
          tools.set(event.index, { id: block.id ?? '', name: block.name ?? '', args: '' });
        } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
          thinking.set(event.index, { ...block });
        }
      }

      if (event.type === 'content_block_delta' && event.index !== undefined && event.delta) {
        const delta = event.delta;
        if (delta.type === 'text_delta' && delta.text) yield { type: 'text', delta: delta.text };
        if (delta.type === 'input_json_delta') {
          const tool = tools.get(event.index);
          if (tool) tool.args += delta.partial_json ?? '';
        }
        const trace = thinking.get(event.index);
        if (trace && delta.type === 'thinking_delta') trace.thinking = `${trace.thinking ?? ''}${delta.thinking ?? ''}`;
        if (trace && delta.type === 'signature_delta') trace.signature = delta.signature;
      }

      if (event.type === 'message_delta') {
        if (event.usage) usage = { ...usage, ...event.usage };
        if (event.delta?.stop_reason === 'max_tokens') finishReason = 'length';
        if (event.delta?.stop_reason === 'tool_use') finishReason = 'tool_calls';
      }
    }

    for (const [index, tool] of tools) {
      if (!tool.name) continue;
      sawToolCall = true;
      yield { type: 'tool-call', call: { id: tool.id || `toolu_${index}`, name: tool.name, arguments: parseArguments(tool.args) } };
    }

    const cached = usage.cache_read_input_tokens;
    yield {
      type: 'usage',
      // Anthropic reports uncached, cache-read and cache-write input separately.
      promptTokens: usage.input_tokens + cached + usage.cache_creation_input_tokens,
      completionTokens: usage.output_tokens,
      cachedPromptTokens: cached,
    };

    const trace = [...thinking.values()];
    yield {
      type: 'done',
      finishReason: sawToolCall ? 'tool_calls' : finishReason,
      ...(trace.length ? { reasoning: JSON.stringify(trace) } : {}),
    };
  }
}

/**
 * The SSE lines, with a connection cut mid-stream reported as a 503.
 * undici throws a bare `TypeError: terminated` there; the fallback rule only
 * reads `LlmStreamError`, so without this a dropped stream ends the turn.
 */
async function* readEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  try {
    yield* sseDataLines(body, signal);
  } catch (error) {
    if (signal?.aborted || error instanceof LlmStreamError) throw error;
    throw new LlmStreamError(503, `Anthropic stream cut: ${(error as Error).message}`);
  }
}

/** Our history as Anthropic messages, tool results folded into one user turn. */
function toMessages(messages: LlmMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];

  for (const message of messages) {
    if (message.role === 'tool') {
      const result: AnthropicBlock = { type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: message.content };
      const last = out[out.length - 1];
      if (last?.role === 'user' && Array.isArray(last.content) && last.content.every((block) => block.type === 'tool_result')) {
        last.content.push(result);
      } else {
        out.push({ role: 'user', content: [result] });
      }
      continue;
    }

    if (message.role === 'assistant' && message.toolCalls?.length) {
      out.push({
        role: 'assistant',
        content: [
          ...parseThinking(message.reasoning),
          ...(message.content ? [{ type: 'text' as const, text: message.content }] : []),
          ...message.toolCalls.map((call) => ({
            type: 'tool_use' as const,
            id: call.id,
            name: call.name,
            input: call.arguments,
          })),
        ],
      });
      continue;
    }

    // The API refuses an empty text block, and a turn with nothing in it.
    if (!message.content) continue;
    out.push({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content });
  }

  return out;
}

/** The thinking blocks a previous round minted; anything unreadable is dropped. */
function parseThinking(reasoning: string | undefined): AnthropicBlock[] {
  if (!reasoning) return [];
  try {
    const parsed = JSON.parse(reasoning) as unknown;
    return Array.isArray(parsed) ? (parsed as AnthropicBlock[]) : [];
  } catch {
    return [];
  }
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
