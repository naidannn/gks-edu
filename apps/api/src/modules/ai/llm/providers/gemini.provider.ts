import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { sseDataLines } from '../sse-lines.js';
import type { LlmChatRequest, LlmEvent, LlmFinishReason, LlmMessage, LlmProvider } from '../llm.types.js';

interface GeminiPart {
  text?: string;
  thought?: boolean;
  /** Echoed back verbatim on the next turn — see `LlmToolCall.signature`. */
  thoughtSignature?: string;
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiStreamChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Gemini, streaming, with function calling (2B-01).
 *
 * The primary provider for the chat: it is the strongest of the cheap models on
 * Mongolian, and it streams and calls tools. Search grounding — the thing
 * `GeminiService` uses for intake research — is deliberately *not* sent here.
 * The assistant answers from the knowledge base and from the database through
 * tools; a grounded web answer would be a third source nobody reviewed
 * (AI-ASSISTANT.md §5.1).
 */
@Injectable()
export class GeminiChatProvider implements LlmProvider {
  readonly name = 'gemini' as const;

  constructor(private readonly config: ConfigService) {}

  async *stream(request: LlmChatRequest): AsyncIterable<LlmEvent> {
    const apiKey = this.config.get<string>('gemini.apiKey');
    if (!apiKey) throw new ServiceUnavailableException('GEMINI_API_KEY тохируулаагүй байна.');

    const baseUrl = this.config.get<string>('gemini.baseUrl');
    const response = await fetch(`${baseUrl}/models/${request.model}:streamGenerateContent?alt=sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: request.messages.map(toContent),
        ...(request.tools?.length
          ? {
              tools: [
                {
                  functionDeclarations: request.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                  })),
                },
              ],
            }
          : {}),
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxOutputTokens ?? 700,
        },
      }),
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      throw await streamError(response);
    }

    let finishReason: LlmFinishReason = 'stop';
    let sawToolCall = false;

    for await (const payload of sseDataLines(response.body, request.signal)) {
      const chunk = JSON.parse(payload) as GeminiStreamChunk;
      const candidate = chunk.candidates?.[0];

      for (const part of candidate?.content?.parts ?? []) {
        // `thought` parts are the model reasoning out loud. They are prose, they
        // sometimes contain a draft of the answer, and streaming them to a
        // visitor shows the workings instead of the answer.
        if (part.thought === true) continue;

        if (part.functionCall?.name) {
          sawToolCall = true;
          yield {
            type: 'tool-call',
            call: {
              // Gemini mints an id of its own; the generated one is the fallback
              // so a result can always be matched back to its call.
              id: part.functionCall.id ?? randomUUID(),
              name: part.functionCall.name,
              arguments: part.functionCall.args ?? {},
              signature: part.thoughtSignature,
            },
          };
        } else if (part.text) {
          yield { type: 'text', delta: part.text };
        }
      }

      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
          completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
        };
      }

      if (candidate?.finishReason) {
        finishReason = candidate.finishReason === 'MAX_TOKENS' ? 'length' : 'stop';
      }
    }

    yield { type: 'done', finishReason: sawToolCall ? 'tool_calls' : finishReason };
  }
}

/** One of our messages as a Gemini `Content`. */
function toContent(message: LlmMessage) {
  if (message.role === 'tool') {
    // A tool result is a `functionResponse` part, and Gemini reads it from the
    // `user` role: the model did not produce it, the caller did.
    return {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: message.name ?? 'tool',
            response: { result: message.content },
          },
        },
      ],
    };
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'model',
      parts: message.toolCalls.map((call) => ({
        functionCall: { id: call.id, name: call.name, args: call.arguments },
        // Required by Gemini 3: replaying a function call without the signature
        // it minted fails the whole request with a 400.
        ...(call.signature ? { thoughtSignature: call.signature } : {}),
      })),
    };
  }

  return {
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  };
}

/**
 * The error a failed stream carries.
 *
 * The status is kept on the exception because `LlmService` decides whether to
 * fall back on it: a 429 or a 5xx is worth trying the other provider for, a 400
 * is a request that will be just as wrong the second time.
 */
async function streamError(response: Response): Promise<LlmStreamError> {
  const body = await response.text().catch(() => '');
  let message = body.slice(0, 300);

  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) message = parsed.error.message.slice(0, 400);
  } catch {
    // Not JSON — a gateway answered. Keep what it said.
  }

  return new LlmStreamError(response.status, `Gemini ${response.status}: ${message}`);
}

/** Carries the HTTP status so the fallback rule can read it. */
export class LlmStreamError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'LlmStreamError';
  }

  /** 429 and 5xx are worth another provider; a 4xx is a bad request. */
  get isRetriable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}
