import { describe, expect, it, vi } from 'vitest';
import { AccessLevel, ChatChannel, ChatSessionStatus, type ChatSession } from '../../../../prisma/client.js';
import type { LlmToolCall } from '../../llm/llm.types.js';
import { ToolRegistry } from './tool-registry.service.js';
import { ToolArgumentError, type AiTool, type AiToolProvider, type ToolContext } from './tool.types.js';

function tool(overrides: Partial<AiTool> = {}): AiTool {
  return {
    name: 'get_fx_rate',
    description: 'Ханш',
    minLevel: AccessLevel.PUBLIC,
    label: 'Ханш шалгаж байна…',
    parameters: { type: 'object', properties: {} },
    run: vi.fn().mockResolvedValue({ title: 'Ханш', data: { нэг_вон_төгрөгөөр: 2.6 } }),
    ...overrides,
  };
}

/** The registry only asks a provider for its tools, so a stub is one method. */
function provider(tools: AiTool[]): AiToolProvider {
  return { tools: () => tools };
}

function registryOf(...tools: AiTool[]): ToolRegistry {
  const empty = provider([]);
  return new ToolRegistry(
    provider(tools) as never,
    empty as never,
    empty as never,
    empty as never,
  );
}

function context(level: AccessLevel): ToolContext {
  return {
    level,
    session: { id: 'session-1', channel: ChatChannel.WEB_WIDGET, status: ChatSessionStatus.ACTIVE } as ChatSession,
    userId: null,
    now: new Date('2026-09-13T00:00:00Z'),
  };
}

function call(overrides: Partial<LlmToolCall> = {}): LlmToolCall {
  return { id: 'call-1', name: 'get_fx_rate', arguments: {}, ...overrides };
}

describe('ToolRegistry', () => {
  describe('what the model is offered', () => {
    it('hides a tool above the caller’s level', () => {
      const registry = registryOf(tool(), tool({ name: 'get_service_pricing', minLevel: AccessLevel.REGISTERED }));

      const names = registry.definitions(AccessLevel.PUBLIC).map((definition) => definition.name);

      // A guest is routed to a consultation rather than quoted a figure
      // (§15-32) — so the price tool is not merely refused, it is not there.
      expect(names).toEqual(['get_fx_rate']);
    });

    it('offers it once the caller has an account', () => {
      const registry = registryOf(tool(), tool({ name: 'get_service_pricing', minLevel: AccessLevel.REGISTERED }));

      const names = registry.definitions(AccessLevel.REGISTERED).map((definition) => definition.name);

      expect(names).toEqual(['get_fx_rate', 'get_service_pricing']);
    });
  });

  describe('running one call', () => {
    it('quotes the result, so its content can never read as an instruction', async () => {
      const registry = registryOf(tool());

      const run = await registry.run({ call: call(), context: context(AccessLevel.PUBLIC), ref: 'T1' });

      expect(run.ok).toBe(true);
      expect(run.content).toContain('<tool_result id="T1" tool="get_fx_rate">');
      expect(run.content).toContain('"нэг_вон_төгрөгөөр":2.6');
      expect(run.content.trimEnd().endsWith('</tool_result>')).toBe(true);
    });

    it('refuses a gated tool even when the model asks for it by name', async () => {
      const gated = tool({ name: 'get_service_pricing', minLevel: AccessLevel.REGISTERED });
      const registry = registryOf(gated);

      const run = await registry.run({
        call: call({ name: 'get_service_pricing' }),
        context: context(AccessLevel.PUBLIC),
        ref: 'T1',
      });

      // The definitions filter is an optimisation; this is the rule. A model
      // that saw the tool earlier in a longer conversation will ask again.
      expect(run.ok).toBe(false);
      expect(gated.run).not.toHaveBeenCalled();
      expect(run.content).toContain('Зөвлөхтэй холбогдох');
    });

    it('turns an invented tool name into an answerable error', async () => {
      const registry = registryOf(tool());

      const run = await registry.run({
        call: call({ name: 'book_my_flight' }),
        context: context(AccessLevel.PUBLIC),
        ref: 'T1',
      });

      expect(run.ok).toBe(false);
      expect(run.content).toContain('байхгүй');
    });

    it('passes a bad-argument complaint back in words the model can act on', async () => {
      const registry = registryOf(
        tool({ run: vi.fn().mockRejectedValue(new ToolArgumentError('"slug" утгыг заавал өгнө үү')) }),
      );

      const run = await registry.run({ call: call(), context: context(AccessLevel.PUBLIC), ref: 'T2' });

      expect(run.ok).toBe(false);
      expect(run.content).toContain('утгыг заавал өгнө үү');
      expect(run.ref).toBe('T2');
    });

    it('never lets a broken service fail the turn', async () => {
      const registry = registryOf(tool({ run: vi.fn().mockRejectedValue(new Error('pooler timeout')) }));

      const run = await registry.run({ call: call(), context: context(AccessLevel.PUBLIC), ref: 'T1' });

      expect(run.ok).toBe(false);
      // The model is told the lookup failed, not handed a stack trace — and the
      // visitor gets an answer that admits the figure is unconfirmed.
      expect(run.content).not.toContain('pooler timeout');
      expect(run.content).toContain('баталгаажуулж чадаагүй');
    });
  });
});
