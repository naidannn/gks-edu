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
  /** The kept answer, when it differs from what was streamed — replaces the bubble's text. */
  | { type: 'replace'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done'; label: string }
  | { type: 'card'; card: AiChatCard }
  | { type: 'sources'; sources: AiSource[] }
  | { type: 'done'; messageId: string; grounded: boolean; truncated: boolean }
  | { type: 'error'; code: string; message: string; fallback: 'messenger' | 'consultation' }
  /**
   * 2C-15 — what a signed-out visitor has left, after each of their turns. Sent
   * by the web endpoint only, not by the orchestrator. Its companion is an
   * `error` with code `auth_required`, which replaces a turn past the allowance.
   */
  | { type: 'quota'; remaining: number; limit: number };

/** The error code that means "sign in and this question will be answered". */
export const AI_AUTH_REQUIRED = 'auth_required';

/** `GET /ai/chat/status`. `guest` is null for somebody signed in. */
export interface AiChatStatus {
  enabled: boolean;
  greeting: string | null;
  guest: AiGuestAllowance | null;
}

/** Free questions before the sign-up card (2C-15). */
export interface AiGuestAllowance {
  limit: number;
  remaining: number;
}

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
  /** 2C-15 — free questions before the sign-up card; 0 = sign in first. */
  guestMessageLimit: number;
  greeting: string;
  persona: string;
  ctaRules: unknown;
  handoffHours: unknown;
  copilotEnabled: boolean;
  updatedAt: string;
  updatedBy: { id: string; name: string | null } | null;
}

/** One row of the `/chat` sidebar — `POST /ai/chat/history` (2C-13). */
export interface AiChatSessionSummary {
  sessionId: string;
  status: AiSessionStatus;
  /** The opening question, on one line, at most 80 characters. */
  title: string;
  lastMessageAt: string;
}

// ─── 2E-04: the office's view of the assistant's conversations ────────────────

export type AiSessionChannel = 'WEB_WIDGET' | 'PORTAL' | 'ADMIN_COPILOT' | 'FACEBOOK';

export type AiChatOutcome = 'NONE' | 'LEAD_CREATED' | 'HANDOFF' | 'CONTRACT_STARTED';

/** Tabs on `/admin/ai/sessions`. */
export type AiAdminSessionScope = 'ALL' | 'LIVE' | 'USERS' | 'GUESTS' | 'LEADS' | 'DISLIKED';

/** Which surface; `WEB` is the site and the cabinet together, and the default. */
export type AiAdminChannelFilter = 'WEB' | 'WEB_WIDGET' | 'PORTAL' | 'FACEBOOK' | 'ALL';

export interface AiAdminSessionPerson {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  client: { id: string; code: string } | null;
}

export interface AiAdminSessionItem {
  id: string;
  code: string;
  channel: AiSessionChannel;
  status: AiSessionStatus;
  outcome: AiChatOutcome;
  accessLevel: 'PUBLIC' | 'REGISTERED' | 'CONTRACTED' | 'INTERNAL';
  anonymousId: string | null;
  /** The opening question. */
  title: string;
  /** The visitor's half of `messageCount`. */
  questions: number;
  messageCount: number;
  costUsd: number;
  landingPage: string | null;
  source: string | null;
  /** Active, and somebody wrote in the last ten minutes. */
  live: boolean;
  lastMessageAt: string;
  createdAt: string;
  user: AiAdminSessionPerson | null;
  lead: { id: string; firstName: string; lastName: string; phone: string } | null;
  feedback: { up: number; down: number };
}

export interface AiAdminSessionCounts {
  all: number;
  live: number;
  users: number;
  guests: number;
  leads: number;
  disliked: number;
}

export interface AiAdminSessionListResponse {
  items: AiAdminSessionItem[];
  meta: { total: number; page: number; limit: number };
  counts: AiAdminSessionCounts;
}

/** One tool run as the orchestrator logs it (`toolLog`). */
export interface AiAdminToolCall {
  ref?: string;
  name: string;
  title?: string;
  arguments?: unknown;
  ok?: boolean;
  durationMs?: number;
}

export interface AiAdminTranscriptMessage {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  citations: AiSource[];
  cards: AiChatCard[];
  toolCalls: AiAdminToolCall[];
  model: string | null;
  grounded: boolean | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number | null;
  createdAt: string;
  feedback: { value: AiFeedbackValue; reason: AiFeedbackReason | null; comment: string | null } | null;
}

export interface AiAdminSessionDetail extends AiAdminSessionItem {
  profile: Record<string, unknown>;
  intents: string[];
  summary: string | null;
  promptTokens: number;
  completionTokens: number;
  case: { id: string; code: string } | null;
  conversationId: string | null;
  messages: AiAdminTranscriptMessage[];
  /** The same person's other conversations — by account, else by browser. */
  others: AiAdminSessionItem[];
}

export interface AiAdminPersonRow {
  kind: 'USER' | 'GUEST';
  anonymousId: string | null;
  user: (AiAdminSessionPerson & { role: string }) | null;
  sessions: number;
  messages: number;
  firstChatAt: string;
  lastChatAt: string;
}

export interface AiAdminPeopleResponse {
  items: AiAdminPersonRow[];
  meta: { total: number; page: number; limit: number };
}
