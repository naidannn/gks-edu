import type { Role } from '../../prisma/client.js';

/**
 * The messenger's wire shapes (1K).
 *
 * `packages/shared` mirrors these for the web app; the API deliberately does
 * not import that package (no module here does), so the two are kept in step
 * by hand — the same arrangement every other module already lives with.
 */

export interface MessengerParticipant {
  id: string;
  name: string | null;
  role: Role;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  kind: 'TEXT' | 'SYSTEM';
  body: string;
  fromStaff: boolean;
  sender: MessengerParticipant | null;
  clientToken: string | null;
  editedAt: Date | null;
  createdAt: Date;
}

export interface ConversationListItem {
  id: string;
  code: string;
  subject: string;
  topic: string;
  status: string;
  caseId: string | null;
  caseCode: string | null;
  assignee: MessengerParticipant | null;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageFromStaff: boolean;
  unread: number;
  createdAt: Date;
}

/**
 * Pushed down `/messenger/stream`. Every variant names its conversation so a
 * browser with that thread open applies it and one without just refreshes its
 * counters.
 */
export type MessengerStreamEvent =
  | { type: 'message'; conversationId: string; message: MessageItem }
  | { type: 'conversation'; conversationId: string; conversation: ConversationListItem }
  | { type: 'typing'; conversationId: string; userId: string; name: string | null; fromStaff: boolean }
  | { type: 'read'; conversationId: string; byStaff: boolean; readAt: Date }
  | { type: 'ping'; conversationId: null };
