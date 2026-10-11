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
export type FacebookThreadScope = 'NEEDS_STAFF' | 'STARRED' | 'ALL' | 'AI' | 'UNLINKED';

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
  /** Marked with a star by anybody in the office. */
  starred: boolean;
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
  starred: number;
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

// ── Report (2F-10) ──────────────────────────────────────────────────────────

/** Day-sized windows first: the Page is watched daily, not monthly. */
export type FacebookReportPreset = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'last-month' | 'custom';

export interface FacebookReportPeriod {
  preset: FacebookReportPreset;
  /** Office-local `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Office-local `YYYY-MM-DD`, **exclusive**. */
  to: string;
  /** The equal-shape window ending where `from` begins. */
  previousFrom: string;
  previousTo: string;
  labelMn: string;
}

/** A figure in the period with the same figure one period earlier. */
export interface FacebookReportMetric {
  value: number;
  previous: number;
  /** `null` when the previous window was zero. */
  changePercent: number | null;
}

export interface FacebookReportDay {
  /** Office-local `YYYY-MM-DD`. */
  day: string;
  /** Distinct people who wrote that day. */
  people: number;
  /** Of them, writing to the Page for the first time. */
  newPeople: number;
  /** Leads captured from a Messenger thread that day. */
  leads: number;
  /** Messages people sent. */
  messages: number;
}

/** How a new conversation reached the Page — the thread's first-touch referral. */
export type FacebookReportSource = 'AD' | 'COMMENT' | 'LINK' | 'DIRECT';

export interface FacebookReportLead {
  leadId: string;
  threadId: string;
  name: string;
  phone: string;
  stage: string;
  /** SOCIAL from a staff member, the assistant otherwise. */
  capturedBy: 'AI' | 'STAFF';
  createdAt: string;
}

export interface FacebookReport {
  period: FacebookReportPeriod;
  generatedAt: string;
  totals: {
    /** Distinct people who wrote in the period. */
    people: FacebookReportMetric;
    /** People whose first message to the Page falls in the period. */
    newPeople: FacebookReportMetric;
    /** Leads (name + phone) captured from a thread in the period. */
    leads: FacebookReportMetric;
    /** Messages people sent. */
    inbound: FacebookReportMetric;
    /** Replies the assistant delivered. */
    aiReplies: FacebookReportMetric;
    /** Replies staff delivered — from `/admin/facebook` or Business Suite. */
    staffReplies: FacebookReportMetric;
    /** Post comments received. */
    comments: FacebookReportMetric;
  };
  /** leads ÷ new people, percent; `null` when nobody new wrote. */
  leadRate: number | null;
  /** Of this period's leads, how many are WON today. */
  leadsWon: number;
  /** Median minutes from a new person's first message to the first reply. */
  firstReplyMedianMinutes: number | null;
  /** New people nobody — assistant or staff — has replied to at all. */
  newUnanswered: number;
  days: FacebookReportDay[];
  /** Messages people sent, by office-local hour 0–23. */
  hours: number[];
  sources: { source: FacebookReportSource; count: number }[];
  /** Who answered: one row per staff member, plus Business Suite as `null`. */
  staff: { staffId: string | null; name: string; replies: number; threads: number }[];
  /** The leads captured in the period, newest first (at most 100). */
  leadList: FacebookReportLead[];
}

// ── AI cost (2F-11) ─────────────────────────────────────────────────────────

/** What the assistant's Messenger answers used and cost, in some slice of the period. */
export interface FacebookAiCostUsage {
  /** Answers the assistant stored. */
  answers: number;
  promptTokens: number;
  /** The part of `promptTokens` the provider served from its prompt cache — billed at a tenth or less. */
  cachedPromptTokens: number;
  /** Output, thinking included. */
  completionTokens: number;
  /** USD, cache discount included. */
  costUsd: number;
}

export interface FacebookAiCostReport {
  period: FacebookReportPeriod;
  generatedAt: string;
  totals: FacebookAiCostUsage & {
    /**
     * Answers stored before the cost was recorded per answer (2F-11). They are
     * priced at list price without the cache discount, so they read high.
     */
    estimatedAnswers: number;
  };
  /** The same totals one period earlier. */
  previous: FacebookAiCostUsage;
  /** Cost against the previous period, percent; `null` when that was zero. */
  costChangePercent: number | null;
  /** USD per answer; `null` with no answers. */
  costPerAnswerUsd: number | null;
  /** Leads the assistant captured on Messenger in the period. */
  aiLeads: number;
  /** USD per lead the assistant captured; `null` with none. */
  costPerAiLeadUsd: number | null;
  /** Percent of input served from cache, over answers that recorded it; `null` when none did. */
  cachedSharePercent: number | null;
  /** One row per office-local day, zero-filled. */
  days: (FacebookAiCostUsage & { day: string })[];
  /** One row per model that answered, most expensive first. */
  models: (FacebookAiCostUsage & { model: string })[];
}
