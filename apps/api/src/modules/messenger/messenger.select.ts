import type { Prisma } from '../../prisma/client.js';

/** Everything a bubble needs, and nothing about the thread it sits in. */
export const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  kind: true,
  body: true,
  fromStaff: true,
  clientToken: true,
  editedAt: true,
  createdAt: true,
  sender: { select: { id: true, name: true, role: true } },
} satisfies Prisma.MessageSelect;

/** A thread head — what a list row renders, with no messages joined. */
export const CONVERSATION_SELECT = {
  id: true,
  code: true,
  subject: true,
  topic: true,
  status: true,
  caseId: true,
  case: { select: { code: true } },
  assignee: { select: { id: true, name: true, role: true } },
  lastMessageAt: true,
  lastMessagePreview: true,
  lastMessageFromStaff: true,
  clientUnread: true,
  staffUnread: true,
  createdAt: true,
} satisfies Prisma.ConversationSelect;

/**
 * The list shape plus who is asking — staff need the person's name, code and
 * phone in the inbox row, a client already knows who they are.
 */
export const CONVERSATION_DETAIL_SELECT = {
  ...CONVERSATION_SELECT,
  firstResponseAt: true,
  resolvedAt: true,
  clientUserId: true,
  clientUser: {
    select: {
      id: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      client: { select: { code: true } },
    },
  },
} satisfies Prisma.ConversationSelect;

export type ConversationRow = Prisma.ConversationGetPayload<{ select: typeof CONVERSATION_SELECT }>;
export type ConversationDetailRow = Prisma.ConversationGetPayload<{
  select: typeof CONVERSATION_DETAIL_SELECT;
}>;
export type MessageRow = Prisma.MessageGetPayload<{ select: typeof MESSAGE_SELECT }>;
