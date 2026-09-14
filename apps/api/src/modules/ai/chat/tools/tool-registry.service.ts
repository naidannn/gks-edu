import { Injectable, Logger } from '@nestjs/common';
import { AccessLevel } from '../../../../prisma/client.js';
import { atLeast } from '../../access-level.js';
import type { LlmToolCall, LlmToolDefinition } from '../../llm/llm.types.js';
import { AdmissionsTools } from './admissions.tools.js';
import { CatalogTools } from './catalog.tools.js';
import { KnowledgeTools } from './knowledge.tools.js';
import { LeadTools } from './lead.tools.js';
import { PricingTools } from './pricing.tools.js';
import {
  ToolArgumentError,
  type AiTool,
  type ChatCard,
  type ToolContext,
  type ToolOutcome,
} from './tool.types.js';

/** One executed call, as the turn records it. */
export interface ToolRun {
  /** The citation the model is told to use for this result — `T1`, `T2`, … */
  ref: string;
  name: string;
  title: string;
  arguments: Record<string, unknown>;
  /** The `<tool_result>` block appended to the conversation. */
  content: string;
  card?: ChatCard;
  ok: boolean;
  durationMs: number;
}

/**
 * The tool registry (2B-06, `AI-ASSISTANT.md` §5.3).
 *
 * It does three things, and the second is the one that matters:
 *
 * 1. **Collects** every tool the modules provide.
 * 2. **Gates them by level, twice.** A tool above the caller's level is left out
 *    of the definitions the model is shown, so it cannot be called — and the
 *    check is repeated when a call arrives, because a model that has seen
 *    `get_service_pricing` earlier in a conversation will occasionally call it
 *    after the caller's level has dropped, and because a name can simply be
 *    hallucinated. The first check is an optimisation; the second is the rule.
 * 3. **Quotes the result.** Everything a tool returns is wrapped in
 *    `<tool_result>` with its reference, so principle 7 — text inside a quote is
 *    data, never instructions — has a visible boundary to point at. A school's
 *    `requirementNote` is staff-typed and a visitor's own words come back
 *    through the profile; neither is a place to take orders from.
 *
 * A failing tool never fails the turn. The model is handed the error in
 * Mongolian and gets to decide what to do about it, which is usually to say the
 * figure could not be checked — a far better answer than a dead stream.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);
  private readonly registry: Map<string, AiTool>;

  constructor(
    catalog: CatalogTools,
    admissions: AdmissionsTools,
    pricing: PricingTools,
    knowledge: KnowledgeTools,
    lead: LeadTools,
  ) {
    const all = [catalog, admissions, pricing, knowledge, lead].flatMap((provider) => provider.tools());
    this.registry = new Map(all.map((tool) => [tool.name, tool]));
  }

  /** Every tool name, whatever the level — for the admin screens and the evals. */
  get names(): string[] {
    return [...this.registry.keys()];
  }

  /** What a caller at this level may call. */
  toolsFor(level: AccessLevel): AiTool[] {
    return [...this.registry.values()].filter((tool) => atLeast(level, tool.minLevel));
  }

  /** The same list in the shape a provider wants. */
  definitions(level: AccessLevel): LlmToolDefinition[] {
    return this.toolsFor(level).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as unknown as Record<string, unknown>,
    }));
  }

  /** The spinner caption, or the bare name for a tool that no longer exists. */
  labelFor(name: string): string {
    return this.registry.get(name)?.label ?? 'Мэдээлэл шалгаж байна…';
  }

  /**
   * Runs one call the model asked for.
   *
   * Always resolves. An unknown name, a refused level, bad arguments and a
   * thrown service all come back as an `ok: false` run whose content is a
   * sentence the model can act on.
   */
  async run(params: {
    call: LlmToolCall;
    context: ToolContext;
    ref: string;
  }): Promise<ToolRun> {
    const startedAt = Date.now();
    const { call, context, ref } = params;
    const tool = this.registry.get(call.name);

    const fail = (message: string, title = 'Алдаа'): ToolRun => ({
      ref,
      name: call.name,
      title,
      arguments: call.arguments,
      content: wrap(ref, call.name, { error: message }),
      ok: false,
      durationMs: Date.now() - startedAt,
    });

    if (!tool) {
      this.logger.warn(`Байхгүй tool дуудлаа: ${call.name}`);
      return fail(`"${call.name}" гэсэн хэрэгсэл байхгүй.`);
    }

    if (!atLeast(context.level, tool.minLevel)) {
      // Not an error the visitor should ever see as one: the model is told to
      // route them to a consultant instead, which is what §15-32 asks for.
      this.logger.warn(`${call.name} нь ${context.level} түвшинд хаалттай`);
      return fail(
        'Энэ мэдээллийг одоогийн хэрэглэгчид өгөх боломжгүй. Зөвлөхтэй холбогдохыг санал болго.',
        'Хаалттай',
      );
    }

    let outcome: ToolOutcome;
    try {
      outcome = await tool.run(call.arguments, context);
    } catch (error) {
      if (error instanceof ToolArgumentError) return fail(error.message, 'Буруу параметр');

      this.logger.error(
        `${call.name} ажиллахад алдаа гарлаа: ${error instanceof Error ? error.message : String(error)}`,
      );
      return fail('Мэдээллийг шалгаж чадсангүй. Хэрэглэгчид энэ тоог баталгаажуулж чадаагүйгээ хэл.');
    }

    return {
      ref,
      name: call.name,
      title: outcome.title,
      arguments: call.arguments,
      content: wrap(ref, call.name, outcome.data),
      ...(outcome.card ? { card: outcome.card } : {}),
      ok: true,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * The quoted block a tool result arrives in.
 *
 * The reference is in the opening tag rather than appended to the JSON so that
 * it survives the model reformatting the content, and so the instruction "cite
 * `[T1]`" has something to point at.
 */
function wrap(ref: string, name: string, data: unknown): string {
  return [
    `<tool_result id="${ref}" tool="${name}">`,
    JSON.stringify(data),
    '</tool_result>',
  ].join('\n');
}
