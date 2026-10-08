/**
 * Facebook Page payloads — 2F.
 *
 * Messenger threads and post comments on the office's Page, answered by the
 * assistant and by staff from `/admin/facebook`. Enums mirror the Prisma ones
 * as string unions so the web app never imports the generated client.
 */

export type FacebookAiMode = 'AUTO' | 'OFF';

/** CONTACT = the person; AI = the assistant; STAFF = us, from `/admin/facebook`;
 *  PAGE = somebody typing in Meta Business Suite or the Facebook app. */
export type FacebookSender = 'CONTACT' | 'AI' | 'STAFF' | 'PAGE';

export type FacebookDeliveryStatus = 'SENT' | 'FAILED';

export type FacebookCommentStatus = 'NEW' | 'AI_REPLIED' | 'STAFF_REPLIED' | 'IGNORED' | 'FAILED';

/**
 * Inbox filters. NEEDS_STAFF is the default: the last word is the contact's and
 * neither the assistant nor a person is going to answer it on their own.
 */
export type FacebookThreadScope = 'NEEDS_STAFF' | 'ALL' | 'AI' | 'UNLINKED';

export interface FacebookAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'other';
  /** Meta's CDN link — it expires after a while. */
  url: string | null;
}

/** The CRM record a thread is tied to, as the inbox header shows it. */
export interface FacebookLinkedLead {
  id: string;
  name: string;
  phone: string;
  stage: string;
}

export interface FacebookLinkedClient {
  id: string;
  code: string;
  name: string;
  phone: string;
}

export interface FacebookThreadItem {
  id: string;
  psid: string;
  name: string | null;
  profilePic: string | null;
  aiMode: FacebookAiMode;
  /** Set after a person wrote in the thread; the assistant is quiet until then. */
  aiPausedUntil: string | null;
  /** True when the assistant would answer the next message right now. */
  aiActive: boolean;
  needsStaff: boolean;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastSender: FacebookSender | null;
  /**
   * Meta's messaging window. Inside 24 hours of the contact's last message a
   * reply is ordinary; up to 7 days it goes as a human-agent message; after
   * that Meta refuses anything until the contact writes again.
   */
  window: 'OPEN' | 'HUMAN_AGENT' | 'CLOSED';
  lead: FacebookLinkedLead | null;
  client: FacebookLinkedClient | null;
}

export interface FacebookThreadCounts {
  needsStaff: number;
  unread: number;
  unlinked: number;
  /** Comments still NEW or FAILED. */
  comments: number;
}

export interface FacebookThreadListResponse {
  items: FacebookThreadItem[];
  total: number;
  counts: FacebookThreadCounts;
}

export interface FacebookMessageItem {
  id: string;
  sender: FacebookSender;
  /** STAFF only — who typed it. */
  staffName: string | null;
  text: string | null;
  attachments: FacebookAttachment[];
  status: FacebookDeliveryStatus;
  error: string | null;
  /** Set when this message was the private reply to a post comment. */
  commentId: string | null;
  /** Set once staff turned this reply into a draft answer card. */
  knowledgeDocumentId: string | null;
  createdAt: string;
}

export interface FacebookThreadDetail extends FacebookThreadItem {
  /** Oldest first. The latest 200 — a Messenger thread rarely runs longer. */
  messages: FacebookMessageItem[];
  /** The assistant's current session code, e.g. `AI-2026-0042`, for the transcript. */
  aiSessionCode: string | null;
  /** What the assistant has noted about this person (education, GPA, phone …). */
  profile: Record<string, unknown>;
  /** First ad/link that opened the thread: `{ ad_id, source, ref }`. */
  referral: Record<string, unknown> | null;
}

export interface FacebookCommentItem {
  id: string;
  commentId: string;
  postId: string;
  postMessage: string | null;
  postPermalink: string | null;
  fromName: string | null;
  text: string;
  status: FacebookCommentStatus;
  error: string | null;
  publicReplyText: string | null;
  privateRepliedAt: string | null;
  /** The Messenger thread the private reply opened, if any. */
  threadId: string | null;
  repliedByName: string | null;
  createdAt: string;
}

export interface FacebookCommentListResponse {
  items: FacebookCommentItem[];
  total: number;
}

/** A lead or client the link picker offers. */
export interface FacebookLinkCandidate {
  kind: 'LEAD' | 'CLIENT';
  id: string;
  name: string;
  phone: string;
  /** Client code (KH-2026-0042) or lead stage. */
  detail: string | null;
}

/** `GET /admin/facebook/status` — is the Page wired up, and what is switched on. */
export interface FacebookStatus {
  /** Page id + access token present. */
  configured: boolean;
  /** No token: sends are logged, not delivered. */
  mock: boolean;
  pageId: string | null;
  /** The assistant's global switch (`AiAssistantConfig.enabled`). */
  assistantEnabled: boolean;
  facebookEnabled: boolean;
  facebookCommentsEnabled: boolean;
  facebookCommentReply: string;
  facebookStaffPauseHours: number;
}
