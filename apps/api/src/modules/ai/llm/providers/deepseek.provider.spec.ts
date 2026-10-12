import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LlmChatRequest } from '../llm.types.js';
import { DeepseekChatProvider } from './deepseek.provider.js';

/**
 * The fallback case (2026-10-12): Gemini answered round one with a tool call,
 * then 503'd, and the turn fell back to DeepSeek with Gemini's tool call in the
 * history. Thinking mode refuses that history — there is no reasoning trace to
 * hand back — so the call must go with thinking off.
 */
function provider() {
  const config = {
    get: (key: string) => (key === 'deepseek.apiKey' ? 'test-key' : 'https://api.deepseek.test'),
  } as unknown as ConfigService;
  return new DeepseekChatProvider(config);
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as Record<string, unknown>;
}

async function drain(request: LlmChatRequest): Promise<void> {
  for await (const event of provider().stream(request)) void event;
}

const base: LlmChatRequest = { model: 'deepseek-v4-flash', system: 'sys', messages: [] };

describe('DeepseekChatProvider thinking mode', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('turns thinking off when the history carries another provider’s tool call', async () => {
    const fetchMock = stubFetch();
    await drain({
      ...base,
      messages: [
        { role: 'user', content: 'Элсэлт хэзээ хаагдах вэ?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'g1', name: 'get_intake_deadlines', arguments: {} }] },
        { role: 'tool', toolCallId: 'g1', content: '[]' },
      ],
    });

    expect(sentBody(fetchMock).thinking).toEqual({ type: 'disabled' });
  });

  it('keeps thinking on for its own tool calls, whose trace it hands back', async () => {
    const fetchMock = stubFetch();
    await drain({
      ...base,
      messages: [
        { role: 'user', content: 'Элсэлт хэзээ хаагдах вэ?' },
        {
          role: 'assistant',
          content: '',
          reasoning: 'trace',
          toolCalls: [{ id: 'd1', name: 'get_intake_deadlines', arguments: {} }],
        },
        { role: 'tool', toolCallId: 'd1', content: '[]' },
      ],
    });

    const body = sentBody(fetchMock);
    expect(body.thinking).toBeUndefined();
    expect((body.messages as { reasoning_content?: string }[])[2]!.reasoning_content).toBe('trace');
  });
});
