import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sseDataLines } from '../sse-lines.js';
import type { LlmChatRequest, LlmEvent, LlmFinishReason, LlmMessage, LlmProvider } from '../llm.types.js';
import { LlmStreamError } from './gemini.provider.js';

interface DeltaToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface DeepseekChunk {
  choices?: {
    delta?: { content?: string; tool_calls?: DeltaToolCall[] };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * DeepSeek, streaming, with tool calling (2B-01).
 *
 * The fallback, and the second opinion. OpenAI-compatible, which makes the
 * adapter short, with one wrinkle worth naming: tool calls arrive as *fragments*
 * — the name in one chunk, the JSON arguments a few characters at a time across
 * the next several — so they are accumulated by index and only emitted once the
 * stream finishes. A tool call parsed from a half-arrived argument string is the
 * classic streaming bug here.
 */
@Injectable()
export class DeepseekChatProvider implements LlmProvider {
  readonly name = 'deepseek' as const;

  constructor(private readonly config: ConfigService) {}

  async *stream(request: LlmChatRequest): AsyncIterable<LlmEvent> {
    const apiKey = this.config.get<string>('deepseek.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('DEEPSEEK_API_KEY тохируулаагүй байна.');

    const baseUrl = this.config.get<string>('deepseek.baseUrl');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: request.model,
        messages: [{ role: 'system', content: request.system }, ...request.messages.map(toMessage)],
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.parameters },
              })),
            }
          : {}),
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxOutputTokens ?? 700,
        stream: true,
        // Without this the usage block never arrives on a streamed call, and the
        // session's token bill silently stays at zero.
        stream_options: { include_usage: true },
      }),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      throw new LlmStreamError(response.status, `DeepSeek ${response.status}: ${body.slice(0, 300)}`);
    }

    const pending = new Map<number, { id: string; name: string; args: string }>();
    let finishReason: LlmFinishReason = 'stop';

    for await (const payload of sseDataLines(response.body, request.signal)) {
      if (payload === '[DONE]') break;

      const chunk = JSON.parse(payload) as DeepseekChunk;
      const choice = chunk.choices?.[0];

      if (choice?.delta?.content) {
        yield { type: 'text', delta: choice.delta.content };
      }

      for (const fragment of choice?.delta?.tool_calls ?? []) {
        const index = fragment.index ?? 0;
        const current = pending.get(index) ?? { id: '', name: '', args: '' };

        pending.set(index, {
          id: fragment.id ?? current.id,
          name: fragment.function?.name ?? current.name,
          args: current.args + (fragment.function?.arguments ?? ''),
        });
      }

      if (choice?.finish_reason === 'length') finishReason = 'length';
      if (choice?.finish_reason === 'tool_calls') finishReason = 'tool_calls';

      if (chunk.usage) {
        yield {
          type: 'usage',
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    for (const [index, call] of pending) {
      if (!call.name) continue;
      yield {
        type: 'tool-call',
        call: {
          id: call.id || `call_${index}`,
          name: call.name,
          // A model that produced unparseable arguments gets an empty object
          // rather than crashing the turn; the tool will reject it with a
          // message the model can read and retry from.
          arguments: parseArguments(call.args),
        },
      };
    }

    yield { type: 'done', finishReason: pending.size > 0 ? 'tool_calls' : finishReason };
  }
}

function toMessage(message: LlmMessage) {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: JSON.stringify(call.arguments) },
      })),
    };
  }

  return { role: message.role, content: message.content };
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
