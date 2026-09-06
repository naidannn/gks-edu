import type { UserRole } from '../schemas/user';

/**
 * Messenger payloads — 1K.
 *
 * The live chat between a client and a real consultant. Enums mirror the
 * Prisma ones as string unions so the web app never imports the generated
 * client, the same arrangement as `notifications.ts`.
 */

export type ConversationStatus = 'OPEN' | 'RESOLVED';

export type ConversationTopic =
  | 'GENERAL'
  | 'ADMISSION'
  | 'DOCUMENTS'
  | 'CONTRACT'
  | 'VISA'
  | 'DEPARTURE'
  | 'OTHER';

export type MessageKind = 'TEXT' | 'SYSTEM';

/** Who the other side of a thread is, as far as a bubble needs to know. */
export interface MessengerParticipant {
  id: string;
  name: string | null;
  role: UserRole;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  kind: MessageKind;
  body: string;
  /** True when a staff member wrote it — which side of the thread it sits on. */
  fromStaff: boolean;
  sender: MessengerParticipant | null;
  /** Echoed back so an optimistic bubble can be replaced by the stored row. */
  clientToken: string | null;
  editedAt: string | null;
  createdAt: string;
}

/** A thread as it appears in a list — no messages, just the head. */
export interface ConversationListItem {
  id: string;
  code: string;
  subject: string;
  topic: ConversationTopic;
  status: ConversationStatus;
  caseId: string | null;
  caseCode: string | null;
  assignee: MessengerParticipant | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageFromStaff: boolean;
  /** Unread count for whoever asked: the client's own, or the shared staff one. */
  unread: number;
  createdAt: string;
}

/** The client side of a thread list item, plus who they are talking to. */
export interface ConversationDetail extends ConversationListItem {
  client: MessengerParticipant & {
    /** `KH-2026-0042` when the user is a registered client, null before that. */
    clientCode: string | null;
    email: string | null;
    phone: string | null;
  };
  firstResponseAt: string | null;
  resolvedAt: string | null;
}

export interface ConversationListResponse {
  items: ConversationListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** Threads with something unread, for the nav badge. */
  unreadThreads: number;
}

/**
 * A page of messages, newest last. Paging runs backwards through time from
 * `before`, so a thread opens at the bottom and older messages load upward.
 */
export interface MessagePageResponse {
  conversation: ConversationDetail;
  items: MessageItem[];
  /** Cursor for the next (older) page — null when the thread's start is loaded. */
  nextBefore: string | null;
}

export interface UnreadSummary {
  /** Threads containing something unread. What the nav badge counts. */
  threads: number;
  messages: number;
}

/** The staff inbox's counters, which double as its filter tabs. */
export interface InboxCounts {
  unassigned: number;
  mine: number;
  /** Open threads where the client spoke last — the queue that owes a reply. */
  waiting: number;
  open: number;
}

// ── Live stream (SSE) ───────────────────────────────────────────────────────

/**
 * Events pushed down `/messenger/stream`. Every one carries `conversationId`,
 * so a client that has the thread open applies it and one that does not just
 * refreshes its list counters.
 */
export type MessengerStreamEvent =
  | { type: 'message'; conversationId: string; message: MessageItem }
  | { type: 'conversation'; conversationId: string; conversation: ConversationListItem }
  | { type: 'typing'; conversationId: string; userId: string; name: string | null; fromStaff: boolean }
  | { type: 'read'; conversationId: string; byStaff: boolean; readAt: string }
  | { type: 'ping'; conversationId: null }
  /**
   * Raised locally by the client after the connection dropped and came back —
   * never sent by the server. Anything that happened while it was down was
   * never delivered, so every screen restates itself instead of trusting a
   * list that quietly stops at the last event it saw.
   */
  | { type: 'reconnect'; conversationId?: undefined };
