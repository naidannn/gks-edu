import type { AccessLevel, ChatSession } from '../../../../prisma/client.js';

/**
 * What a tool is, and what it may hand back (2B-06, `AI-ASSISTANT.md` §5.3).
 *
 * Every tool is a thin wrapper over a service that already exists —
 * `UniversitiesService`, `AdmissionsService`, `PricingService`. That is the
 * whole design: the assistant must not be a second source of a number, so it
 * reads the same rows the website reads, through the same code, with the same
 * public projection. A tool that queried Prisma directly could quietly expose
 * `gksRank` or the school's own deadline; one that calls the public service
 * cannot, because those columns never leave it.
 */

/** The JSON Schema subset both Gemini and DeepSeek accept for a parameter. */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

/** Who is asking, and what they are allowed to be told. */
export interface ToolContext {
  /** Re-resolved every turn — a contract signed mid-conversation raises it. */
  level: AccessLevel;
  session: ChatSession;
  userId: string | null;
  now: Date;
}

/**
 * A card as it goes to the widget. The `data` shapes are defined once, in
 * `packages/shared/src/schemas/ai-tools.ts`, which is what 2C-03 renders
 * against; the API cannot import that package (see the note in its header), so
 * the mappers below build those shapes and this type carries them untyped.
 */
export interface ChatCard {
  type: 'universities' | 'university' | 'programs' | 'intakes' | 'pricing' | 'fx';
  data: unknown;
}

export interface ToolOutcome {
  /**
   * The result the model reads, JSON-serialised into a `<tool_result>` block.
   *
   * Keep it small and keep it flat. Every field costs tokens on this turn and
   * on every later turn that replays the history, and a field the model cannot
   * use is a field it can misread.
   */
  data: unknown;
  /** Rendered beside the answer, with the figures straight from the database. */
  card?: ChatCard;
  /** What the citation list calls this result — `[T1] Үйлчилгээний үнэ`. */
  title: string;
}

export interface AiTool {
  name: string;
  /** Read by the model, so it is in the language the model answers in. */
  description: string;
  /** The lowest level allowed to call it; below that the model never sees it. */
  minLevel: AccessLevel;
  parameters: ToolParameterSchema;
  /** Shown in the widget while it runs — "Элсэлтийн хуанли шалгаж байна…". */
  label: string;
  run(args: Record<string, unknown>, context: ToolContext): Promise<ToolOutcome>;
}

/** A group of related tools. The registry collects every provider it is given. */
export interface AiToolProvider {
  tools(): AiTool[];
}

/** Thrown when the model calls a tool with arguments that cannot be used. */
export class ToolArgumentError extends Error {}
