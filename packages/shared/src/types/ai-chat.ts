import type { AiChatCard } from '../schemas/ai-tools';

/**
 * The assistant's chat payloads — 2B-09 on the wire, 2C-01/02 on screen.
 *
 * These mirror `apps/api/src/modules/ai/chat/turn.orchestrator.ts`. The API
 * cannot import this package (see the header of `schemas/ai-tools.ts`), so the
 * two are kept in step by hand: a variant added to `TurnEvent` there has to be
 * added to `AiStreamEvent` here, or the widget will silently ignore it.
 */

export type AiChatChannel = 'WEB_WIDGET' | 'PORTAL' | 'ADMIN_COPILOT';

export type AiSessionStatus = 'ACTIVE' | 'HANDED_OFF' | 'CLOSED';

/**
 * A citation as the widget shows it — never the chunk id, never the level.
 *
 * `ref` is the marker the answer itself carries (`[K1]`, `[T2]`), which is how
 * a sentence is tied to the thing it came from.
 */
export interface AiSource {
  ref: string;
  title: string;
  heading: string | null;
  /** A document from the knowledge base, or a live lookup in our own data. */
  kind: 'knowledge' | 'tool';
}

/**
 * One frame of a streamed turn.
 *
 * `error` is not an exception: it is the assistant saying it cannot answer —
 * switched off, out of budget, handed to a human — and `fallback` names the
 * route to a person that the widget should offer instead. Every one of those
 * cases must leave the visitor somewhere to go (AI-ASSISTANT.md principle 8).
 */
export type AiStreamEvent =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done'; label: string }
  | { type: 'card'; card: AiChatCard }
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'done'; messageId: string; grounded: boolean; truncated: boolean }
  | { type: 'error'; code: string; message: string; fallback: 'messenger' | 'consultation' };

/** What `POST /ai/chat/sessions` answers with. */
export interface AiSessionStart {
  sessionId: string;
  code: string;
  /** Proves this conversation, nothing else. Kept in `localStorage`. */
  token: string;
  greeting: string;
  enabled: boolean;
}

/** A stored message, as a reload mid-conversation reads it back. */
export interface AiChatMessageItem {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  sources: AiSource[];
  cards: AiChatCard[];
  grounded: boolean;
  feedback: { value: AiFeedbackValue; reason: AiFeedbackReason | null } | null;
  createdAt: string;
}

export interface AiChatTranscript {
  sessionId: string;
  status: AiSessionStatus;
  messages: AiChatMessageItem[];
}

export type AiFeedbackValue = 'UP' | 'DOWN';

export type AiFeedbackReason = 'WRONG' | 'INCOMPLETE' | 'IRRELEVANT' | 'OTHER';

/**
 * The assistant's whole configuration (2B-02), as `/admin/ai/settings` edits it.
 *
 * Every field here is a business decision rather than a constant — model,
 * thresholds, budgets, wording and office hours all belong to the people who
 * answer for the answers (AI-ASSISTANT.md principle 7).
 */
export interface AiAssistantConfigPayload {
  id: string;
  enabled: boolean;
  chatModel: string;
  fallbackModel: string | null;
  embeddingModel: string;
  temperature: number;
  maxOutputTokens: number;
  retrievalTopK: number;
  minSimilarity: number;
  sessionMessageLimit: number;
  sessionTokenBudget: number;
  dailyTokenBudget: number;
  leadCaptureAfterMessages: number;
  greeting: string;
  persona: string;
  ctaRules: unknown;
  handoffHours: unknown;
  copilotEnabled: boolean;
  updatedAt: string;
  updatedBy: { id: string; name: string | null } | null;
}
