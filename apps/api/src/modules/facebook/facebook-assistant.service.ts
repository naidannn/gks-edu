import { Injectable, Logger } from '@nestjs/common';
import {
  AccessLevel,
  ChatChannel,
  FacebookCommentStatus,
  FacebookSender,
  type AiAssistantConfig,
  type ChatSession,
  type FacebookThread,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import { ChatSessionService } from '../ai/chat/chat-session.service.js';
import { TurnOrchestrator } from '../ai/chat/turn.orchestrator.js';
import type { LlmMessage } from '../ai/llm/llm.types.js';
import { FacebookGraphError, FacebookGraphService } from './facebook-graph.service.js';
import { FacebookIntakeService } from './facebook-intake.service.js';
import {
  assistantActive,
  messagingWindow,
  preview,
  splitForMessenger,
  toMessengerText,
} from './facebook-rules.js';

/** Messages from the thread replayed to the model, before the ones being answered. */
const HISTORY_MESSAGES = 12;

/** A burst longer than this is somebody pasting; the last few carry the question. */
const MAX_PENDING = 8;

/**
 * The assistant on the Page (2F): a Messenger reply, and a comment's answer.
 *
 * Both run the same turn the website's widget runs — `TurnOrchestrator`, with
 * its retrieval, tools, guard, budget and billing — through a `ChatSession` of
 * channel `FACEBOOK`. Nothing about *what* the assistant may say is decided
 * here; this class only decides *whether* it speaks, and carries the answer to
 * Messenger.
 *
 * Silence is always the failure mode, never an apology. The widget can turn
 * "the assistant is unavailable" into a button to a person; Messenger cannot,
 * and a Page that answers "AI туслах түр унтраалттай" to a customer has said
 * something worse than nothing. So every refusal — switch off, budget spent,
 * a leak caught, a provider down — ends with the thread flagged for staff and
 * nothing sent.
 */
@Injectable()
export class FacebookAssistantService {
  private readonly logger = new Logger(FacebookAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiConfig: AiConfigService,
    private readonly sessions: ChatSessionService,
    private readonly orchestrator: TurnOrchestrator,
    private readonly graph: FacebookGraphService,
    private readonly intake: FacebookIntakeService,
  ) {}

  // ─── Messenger ──────────────────────────────────────────────────────────────

  async replyToThread(threadId: string): Promise<void> {
    const startedAt = new Date();
    const config = await this.aiConfig.get();
    const thread = await this.prisma.facebookThread.findUnique({ where: { id: threadId } });
    if (!thread) return;

    if (!assistantActive(thread, config)) return;

    const pending = await this.unanswered(thread.id);
    if (pending.length === 0) return;

    const words = pending.filter((message) => message.text?.trim());
    // The assistant only answers inside the ordinary 24 hours. It replies to
    // what was just said, so it is always inside them — unless the job sat in a
    // queue all day, and then the answer is stale anyway.
    if (words.length === 0 || messagingWindow(thread.lastInboundAt) !== 'OPEN') {
      await this.flag(thread.id);
      return;
    }

    const question = words.map((message) => message.text!.trim()).join('\n');
    const session = await this.sessionFor(thread, config);

    await this.graph.typing(thread.psid);

    const history = await this.history(thread.id, pending[0]!.createdAt);
    const answer = await this.turn(session, question, [...history, { role: 'user', content: question }]);
    if (!answer) {
      await this.flag(thread.id);
      return;
    }

    // A person may have stepped in while the model was thinking — a reply from
    // Business Suite, or the switch turned off from our inbox. Theirs stands;
    // the assistant's answer stays in its own ledger and is not sent over it.
    const current = await this.prisma.facebookThread.findUnique({ where: { id: thread.id } });
    if (!current || !assistantActive(current, await this.aiConfig.get())) return;

    const delivered = await this.deliver(current, answer.text, answer.messageId);

    await this.prisma.facebookThread.update({
      where: { id: thread.id },
      data: delivered
        ? {
            needsStaff: false,
            lastMessageAt: new Date(),
            lastMessagePreview: preview(toMessengerText(answer.text)),
            lastSender: FacebookSender.AI,
          }
        : { needsStaff: true },
    });

    await this.adoptLead(thread.id, session.id);

    // Anything that arrived while this turn ran was not part of its question,
    // and its own reply job was swallowed by this one's id. Ask again.
    const later = await this.prisma.facebookMessage.count({
      where: { threadId: thread.id, sender: FacebookSender.CONTACT, createdAt: { gt: startedAt } },
    });
    if (later > 0) await this.intake.queueReply(thread.id, 1_000);
  }

  /** The contact's messages since anybody last answered — the question to reply to. */
  private async unanswered(threadId: string) {
    const lastAnswer = await this.prisma.facebookMessage.findFirst({
      where: { threadId, sender: { not: FacebookSender.CONTACT }, status: 'SENT' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const rows = await this.prisma.facebookMessage.findMany({
      where: {
        threadId,
        sender: FacebookSender.CONTACT,
        ...(lastAnswer ? { createdAt: { gt: lastAnswer.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_PENDING,
      select: { text: true, createdAt: true },
    });

    return rows.reverse();
  }

  /**
   * What was said before, as the model reads it.
   *
   * The contact is `user`; the assistant, staff and the Page in Business Suite
   * are all `assistant` — to the person on the other end they are one voice,
   * the Page, and the model has to keep to what that voice already promised.
   * Consecutive lines from one side are joined, because providers want turns
   * to alternate and a burst of three messages is one turn anyway.
   */
  private async history(threadId: string, before: Date): Promise<LlmMessage[]> {
    const rows = await this.prisma.facebookMessage.findMany({
      where: { threadId, createdAt: { lt: before }, text: { not: null }, status: 'SENT' },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MESSAGES,
      select: { sender: true, text: true },
    });

    const turns: LlmMessage[] = [];
    for (const row of rows.reverse()) {
      const role = row.sender === FacebookSender.CONTACT ? ('user' as const) : ('assistant' as const);
      const content = row.text!.trim();
      if (!content) continue;
      const last = turns.at(-1);
      if (last && last.role === role) last.content = `${last.content}\n${content}`;
      else turns.push({ role, content });
    }

    // A conversation the Page opened (a private reply) starts on our side;
    // the providers want the first turn to be the person's.
    while (turns[0]?.role === 'assistant') turns.shift();
    return turns;
  }

  // ─── comments ───────────────────────────────────────────────────────────────

  /**
   * A comment under a post: the fixed public line, and the real answer in a
   * private reply (the office's call — prices and dates never go public).
   *
   * The answer is generated first and the public line goes out only once the
   * private one has landed: "дэлгэрэнгүйг inbox-оор илгээлээ" under a comment
   * whose inbox stayed empty is a promise broken in public.
   */
  async answerComment(commentId: string): Promise<void> {
    const config = await this.aiConfig.get();
    if (!config.enabled || !config.facebookCommentsEnabled) return;

    const comment = await this.prisma.facebookComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.status !== FacebookCommentStatus.NEW) return;

    const post = comment.postMessage ? null : await this.graph.postInfo(comment.postId);
    const postMessage = comment.postMessage ?? post?.message ?? null;
    if (post) {
      await this.prisma.facebookComment.update({
        where: { id: comment.id },
        data: { postMessage: post.message, postPermalink: post.permalink },
      });
    }

    // Somebody who already writes to the Page keeps their own session — the
    // assistant should remember them — but the commenter's id is not a PSID,
    // so that is only known after the private reply. Until then: a new one.
    const { session } = await this.sessions.start({
      channel: ChatChannel.FACEBOOK,
      anonymousId: `fb-comment:${comment.fromId}`,
      accessLevel: AccessLevel.PUBLIC,
      landingPage: comment.postPermalink ?? post?.permalink ?? null,
    });

    const question = commentQuestion(comment.text, postMessage);
    const answer = await this.turn(session, question, [{ role: 'user', content: question }]);
    if (!answer) {
      await this.prisma.facebookComment.update({
        where: { id: comment.id },
        data: { status: FacebookCommentStatus.FAILED, error: 'AI хариулт өгч чадсангүй — ажилтан хариулна уу' },
      });
      return;
    }

    try {
      // One message only: a private reply does not open Meta's window, so the
      // Page cannot follow it up until the person writes back. The answer is
      // short by instruction; the rare long one is cut at a sentence.
      const text = splitForMessenger(toMessengerText(answer.text))[0]!;
      const sent = await this.graph.privateReply(comment.commentId, text);
      const thread = await this.threadForPrivateReply(sent.recipientId, comment.fromName, session.id);

      await this.prisma.facebookMessage.create({
        data: {
          threadId: thread.id,
          mid: sent.messageId,
          sender: FacebookSender.AI,
          text,
          commentId: comment.commentId,
          chatMessageId: answer.messageId,
        },
      });
      await this.prisma.facebookThread.update({
        where: { id: thread.id },
        data: { lastMessageAt: new Date(), lastMessagePreview: preview(text), lastSender: FacebookSender.AI },
      });

      const publicReplyId = await this.graph.replyToComment(comment.commentId, config.facebookCommentReply);

      await this.prisma.facebookComment.update({
        where: { id: comment.id },
        data: {
          status: FacebookCommentStatus.AI_REPLIED,
          privateRepliedAt: new Date(),
          threadId: thread.id,
          publicReplyId,
          publicReplyText: config.facebookCommentReply,
          error: null,
        },
      });
    } catch (error) {
      const message = error instanceof FacebookGraphError ? error.staffMessage : String(error);
      this.logger.warn(`Facebook сэтгэгдэлд хариулж чадсангүй (${comment.commentId}): ${message}`);
      await this.prisma.facebookComment.update({
        where: { id: comment.id },
        data: { status: FacebookCommentStatus.FAILED, error: message },
      });
      if (error instanceof FacebookGraphError && error.transient) throw error;
    }
  }

  /**
   * The Messenger thread a private reply landed in.
   *
   * Someone already writing to the Page has a thread, and it keeps its own
   * session. Someone new gets one now — they will most likely answer the
   * private reply — and inherits the comment's session, so the assistant
   * remembers what it told them under the post.
   */
  private async threadForPrivateReply(psid: string, name: string | null, sessionId: string) {
    const existing = await this.prisma.facebookThread.findUnique({ where: { psid } });
    if (existing) return existing;

    const profile = await this.graph.profile(psid);
    return this.prisma.facebookThread.upsert({
      where: { psid },
      create: {
        psid,
        name: profile?.name ?? name,
        profilePic: profile?.profilePic ?? null,
        chatSessionId: sessionId,
      },
      update: {},
    });
  }

  // ─── shared ─────────────────────────────────────────────────────────────────

  /**
   * One turn, collected rather than streamed — Messenger takes a whole message.
   *
   * The text sent is the *stored* answer, not the concatenated tokens. Those
   * differ exactly when the guard caught a leak and replaced the answer, and
   * the replacement is the only version anybody is allowed to read.
   */
  private async turn(
    session: ChatSession,
    question: string,
    history: LlmMessage[],
  ): Promise<{ text: string; messageId: string } | null> {
    let messageId: string | null = null;

    for await (const event of this.orchestrator.run({
      session,
      level: AccessLevel.PUBLIC,
      message: question,
      history,
    })) {
      if (event.type === 'error') {
        this.logger.warn(`${session.code}: AI хариулсангүй — ${event.message}`);
        return null;
      }
      if (event.type === 'done') messageId = event.messageId;
    }

    if (!messageId) return null;

    const stored = await this.prisma.chatMessage.findUnique({ where: { id: messageId }, select: { content: true } });
    const text = stored?.content.trim();
    return text ? { text, messageId } : null;
  }

  /** Sends an answer as one or more Messenger messages. False if Meta refused the first. */
  private async deliver(thread: FacebookThread, answer: string, chatMessageId: string): Promise<boolean> {
    const parts = splitForMessenger(toMessengerText(answer));

    for (const [index, part] of parts.entries()) {
      try {
        const sent = await this.graph.sendText(thread.psid, part);
        await this.prisma.facebookMessage.create({
          data: {
            threadId: thread.id,
            mid: sent.messageId,
            sender: FacebookSender.AI,
            text: part,
            ...(index === 0 ? { chatMessageId } : {}),
          },
        });
      } catch (error) {
        const message = error instanceof FacebookGraphError ? error.staffMessage : String(error);
        this.logger.warn(`Messenger руу илгээж чадсангүй (${thread.psid}): ${message}`);
        await this.prisma.facebookMessage.create({
          data: { threadId: thread.id, sender: FacebookSender.AI, text: part, status: 'FAILED', error: message },
        });
        return index > 0;
      }
    }

    return true;
  }

  /**
   * The thread's session, rotated when it has run out of room.
   *
   * A Messenger thread has no end — the same person writes in March and again
   * in August — while a session has a message and token ceiling that exists to
   * stop a runaway conversation. Hitting it on the web means "talk to a
   * person"; here it would mean the assistant going silent for good in this
   * thread. So a full session is retired and a fresh one carries on, keeping
   * what was learnt (profile, lead) and leaving the history to the thread.
   */
  private async sessionFor(thread: FacebookThread, config: AiAssistantConfig): Promise<ChatSession> {
    const current = thread.chatSessionId
      ? await this.prisma.chatSession.findUnique({ where: { id: thread.chatSessionId } })
      : null;

    const full =
      current &&
      (current.messageCount >= config.sessionMessageLimit - 2 ||
        current.promptTokens + current.completionTokens >= config.sessionTokenBudget * 0.9);

    if (current && !full && current.status === 'ACTIVE') return current;

    const { session } = await this.sessions.start({
      channel: ChatChannel.FACEBOOK,
      anonymousId: `fb:${thread.psid}`,
      accessLevel: AccessLevel.PUBLIC,
    });

    const leadId = current?.leadId ?? thread.leadId ?? (await this.clientLeadId(thread.clientId));
    const carried = await this.prisma.chatSession.update({
      where: { id: session.id },
      data: {
        ...(current ? { profile: current.profile as object, summary: current.summary } : {}),
        // One person is one enquiry. A thread already tied to a lead must not
        // let the assistant file a second one for the same phone call.
        ...(leadId ? { leadId } : {}),
      },
    });

    if (current) await this.sessions.close(current.id);
    await this.prisma.facebookThread.update({ where: { id: thread.id }, data: { chatSessionId: carried.id } });

    return carried;
  }

  private async clientLeadId(clientId: string | null): Promise<string | null> {
    if (!clientId) return null;
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { leadId: true } });
    return client?.leadId ?? null;
  }

  /** A lead the assistant created in this turn belongs to the thread too. */
  private async adoptLead(threadId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({ where: { id: sessionId }, select: { leadId: true } });
    if (!session?.leadId) return;
    await this.prisma.facebookThread.updateMany({
      where: { id: threadId, leadId: null },
      data: { leadId: session.leadId },
    });
  }

  private async flag(threadId: string): Promise<void> {
    await this.prisma.facebookThread.update({ where: { id: threadId }, data: { needsStaff: true } });
  }
}

/** The comment as the model reads it: what was asked, and under what. */
export function commentQuestion(comment: string, post: string | null): string {
  const lines = ['(Facebook постны доор бичсэн сэтгэгдэл. Хариулт хувийн мессежээр очно.)'];
  if (post?.trim()) lines.push(`Пост: «${post.trim().replace(/\s+/g, ' ').slice(0, 500)}»`);
  lines.push(`Сэтгэгдэл: ${comment.trim()}`);
  return lines.join('\n');
}
