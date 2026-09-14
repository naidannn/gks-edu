import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiConfigService } from '../ai-config.service.js';
import { costMicros, type LlmEvent } from './llm.types.js';
import { LlmService } from './llm.service.js';
import { sseDataLines } from './sse-lines.js';
import { DeepseekChatProvider } from './providers/deepseek.provider.js';
import { GeminiChatProvider, LlmStreamError } from './providers/gemini.provider.js';

/** A ReadableStream that hands out exactly these byte chunks. */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function responseOf(chunks: string[]): Response {
  return { ok: true, body: streamOf(chunks) } as Response;
}

const config = {
  get: (key: string) =>
    ({
      'gemini.apiKey': 'k',
      'gemini.baseUrl': 'https://gemini.test/v1beta',
      'deepseek.apiKey': 'k',
      'deepseek.baseUrl': 'https://deepseek.test',
    })[key],
} as unknown as ConfigService;

async function collect(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const seen: LlmEvent[] = [];
  for await (const event of events) seen.push(event);
  return seen;
}

describe('sseDataLines', () => {
  it('reassembles a payload split across network chunks', async () => {
    // The bug this prevents: a chunk is not an event. One JSON payload routinely
    // arrives in two reads, and a per-chunk parser drops it.
    const lines: string[] = [];
    for await (const line of sseDataLines(streamOf(['data: {"a":', '1}\n']))) lines.push(line);

    expect(lines).toEqual(['{"a":1}']);
  });

  it('emits a final line that never got its newline', async () => {
    const lines: string[] = [];
    for await (const line of sseDataLines(streamOf(['data: {"a":1}']))) lines.push(line);

    expect(lines).toEqual(['{"a":1}']);
  });

  it('ignores keep-alives and comment lines', async () => {
    const lines: string[] = [];
    for await (const line of sseDataLines(streamOf([': ping\n\ndata: {"b":2}\n\n']))) lines.push(line);

    expect(lines).toEqual(['{"b":2}']);
  });
});

describe('GeminiChatProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('streams text and reports usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"candidates":[{"content":{"parts":[{"text":"Сайн "}]}}]}\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"байна уу"}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":4}}\n',
      ]),
    );

    const events = await collect(
      new GeminiChatProvider(config).stream({
        model: 'gemini-3.1-flash-lite',
        system: 's',
        messages: [{ role: 'user', content: 'сайн уу' }],
      }),
    );

    expect(events.filter((e) => e.type === 'text').map((e) => (e as { delta: string }).delta)).toEqual([
      'Сайн ',
      'байна уу',
    ]);
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'stop' });
    expect(events).toContainEqual({ type: 'usage', promptTokens: 10, completionTokens: 4 });
  });

  it('never streams the model thinking out loud', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"candidates":[{"content":{"parts":[{"text":"Хэрэглэгч юу асууж байна…","thought":true},{"text":"Хариулт"}]}}]}\n',
      ]),
    );

    const events = await collect(
      new GeminiChatProvider(config).stream({ model: 'm', system: 's', messages: [] }),
    );

    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', delta: 'Хариулт' }]);
  });

  it('carries the tool call id and its thought signature', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"id":"call_1","name":"get_fx_rate","args":{}},"thoughtSignature":"sig-abc"}]}}]}\n',
      ]),
    );

    const events = await collect(
      new GeminiChatProvider(config).stream({ model: 'm', system: 's', messages: [] }),
    );

    expect(events[0]).toEqual({
      type: 'tool-call',
      call: { id: 'call_1', name: 'get_fx_rate', arguments: {}, signature: 'sig-abc' },
    });
    expect(events.at(-1)).toEqual({ type: 'done', finishReason: 'tool_calls' });
  });

  it('replays the signature on the next turn — Gemini 3 rejects the request without it', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseOf(['data: {"candidates":[]}\n']));

    await collect(
      new GeminiChatProvider(config).stream({
        model: 'm',
        system: 's',
        messages: [
          { role: 'user', content: 'үнэ хэд вэ' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [{ id: 'call_1', name: 'get_service_pricing', arguments: { serviceType: 'BACHELOR' }, signature: 'sig-abc' }],
          },
          { role: 'tool', toolCallId: 'call_1', name: 'get_service_pricing', content: '{"totalAmount":1200000}' },
        ],
      }),
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as {
      contents: { role: string; parts: Record<string, unknown>[] }[];
    };
    expect(body.contents[1]!.parts[0]).toMatchObject({ thoughtSignature: 'sig-abc' });
    // A tool result goes back as a functionResponse, not as prose.
    expect(body.contents[2]!.parts[0]).toHaveProperty('functionResponse');
  });

  it('keeps the HTTP status on a failure so the fallback rule can read it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => '{"error":{"message":"quota"}}',
    } as Response);

    await expect(
      collect(new GeminiChatProvider(config).stream({ model: 'm', system: 's', messages: [] })),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe('DeepseekChatProvider', () => {
  afterEach(() => vi.restoreAllMocks());

  it('assembles a tool call from its fragments', async () => {
    // The arguments arrive a few characters at a time; parsing any single
    // fragment is the classic streaming bug with OpenAI-style APIs.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_9","function":{"name":"search_programs","arguments":"{\\"key"}}]}}]}\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"word\\":\\"IT\\"}"}}]},"finish_reason":"tool_calls"}]}\n',
        'data: [DONE]\n',
      ]),
    );

    const events = await collect(
      new DeepseekChatProvider(config).stream({ model: 'deepseek-v4-flash', system: 's', messages: [] }),
    );

    expect(events[0]).toEqual({
      type: 'tool-call',
      call: { id: 'call_9', name: 'search_programs', arguments: { keyword: 'IT' } },
    });
  });

  it('survives arguments that never parse', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c","function":{"name":"t","arguments":"{oops"}}]}}]}\n',
        'data: [DONE]\n',
      ]),
    );

    const events = await collect(
      new DeepseekChatProvider(config).stream({ model: 'm', system: 's', messages: [] }),
    );

    // Empty arguments, so the tool can reject them with a message the model can
    // read — rather than an exception that loses the whole turn.
    expect(events[0]).toMatchObject({ type: 'tool-call', call: { arguments: {} } });
  });

  it('asks for usage on a streamed call', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseOf(['data: [DONE]\n']));

    await collect(new DeepseekChatProvider(config).stream({ model: 'm', system: 's', messages: [] }));

    // Without `include_usage` the token bill silently stays at zero.
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
  });
});

describe('LlmService', () => {
  afterEach(() => vi.restoreAllMocks());

  const aiConfig = {
    get: async () => ({
      chatModel: 'gemini-3.1-flash-lite',
      fallbackModel: 'deepseek-v4-flash',
      temperature: 0.2,
      maxOutputTokens: 700,
    }),
  } as unknown as AiConfigService;

  function service() {
    return new LlmService(config, aiConfig, new GeminiChatProvider(config), new DeepseekChatProvider(config));
  }

  it('routes on the model-name prefix', () => {
    expect(service().providerFor('deepseek-v4-flash').name).toBe('deepseek');
    expect(service().providerFor('gemini-3.1-flash-lite').name).toBe('gemini');
  });

  it('falls back to the other provider on a 429, before anything was streamed', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'down' } as Response)
      .mockResolvedValueOnce(
        responseOf(['data: {"choices":[{"delta":{"content":"Хариулт"}}]}\n', 'data: [DONE]\n']),
      );

    let result: { model: string; usedFallback: boolean } | null = null;
    const events = await collect(
      service().stream({ system: 's', messages: [] }, (r) => {
        result = r;
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'text', delta: 'Хариулт' });
    expect(result).toMatchObject({ model: 'deepseek-v4-flash', usedFallback: true });
  });

  it('does not fall back on a 400 — the same request fails the same way twice', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' } as Response);

    await expect(collect(service().stream({ system: 's', messages: [] }))).rejects.toBeInstanceOf(LlmStreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not switch models mid-answer', async () => {
    // Half an answer in one voice and half in another reads as a malfunction
    // even when both halves are right.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        ({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Эхлэл"}]}}]}\n'));
              controller.error(new Error('connection reset'));
            },
          }),
        }) as Response,
    );

    await expect(collect(service().stream({ system: 's', messages: [] }))).rejects.toThrow(/connection reset/);
  });

  it('reports what the call cost', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responseOf([
        'data: {"candidates":[{"content":{"parts":[{"text":"x"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":6000,"candidatesTokenCount":400}}\n',
      ]),
    );

    let result: { costMicros: number; promptTokens: number } | null = null;
    await collect(
      service().stream({ system: 's', messages: [] }, (r) => {
        result = r;
      }),
    );

    // 6000 in + 400 out on flash-lite ≈ $0.0021 — the estimate §13 budgets with.
    expect(result!.promptTokens).toBe(6000);
    expect(result!.costMicros).toBe(costMicros('gemini-3.1-flash-lite', 6000, 400));
    expect(result!.costMicros).toBeGreaterThan(2_000);
    expect(result!.costMicros).toBeLessThan(2_500);
  });
});

describe('costMicros', () => {
  it('never bills an unknown model at zero', () => {
    // A model missing from the price table costing nothing is how a budget
    // silently stops working.
    expect(costMicros('some-new-model', 1_000, 1_000)).toBeGreaterThan(0);
  });

  it('rounds up, so a tiny call is not free', () => {
    expect(costMicros('gemini-3.1-flash-lite', 1, 0)).toBe(1);
  });
});
