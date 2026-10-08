import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import {
  FacebookCommentStatus,
  FacebookSender,
  Prisma,
  type FacebookThread,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FACEBOOK_ASSISTANT_QUEUE,
  FACEBOOK_COMMENT_JOB,
  FACEBOOK_REPLY_DEBOUNCE_MS,
  FACEBOOK_REPLY_JOB,
} from '../../queue/queue.constants.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import { FacebookGraphService } from './facebook-graph.service.js';
import { assistantActive, isAnswerableComment, preview } from './facebook-rules.js';
import type { FacebookCommentJob, FacebookReplyJob } from './facebook.types.js';
import { pageEvents, type PageEntry, type PageEvent } from './facebook-webhook.js';

const HOUR_MS = 60 * 60 * 1000;

/**
 * A Page echo this soon after the contact wrote is Business Suite's own
 * automation — an instant reply, a greeting, an away message — not a person.
 * Nobody reads a message and types an answer in ten seconds; Meta's automated
 * responses go out in one to five. Treated as a human, the greeting the Page
 * already sends to every new conversation paused the assistant on the very
 * first message of every thread.
 */
const AUTOMATED_ECHO_WINDOW_MS = 10_000;

/**
 * Stores what the Page webhook reported, and decides who answers it (2F).
 *
 * Every write is keyed on Meta's own id, so the same entry processed twice — a
 * webhook Meta retried, a job BullMQ retried — changes nothing the second time.
 * That is the whole of the module's delivery guarantee, and it is enough: Meta
 * delivers at least once, and "at least once" plus an idempotent write is
 * "exactly once" from the inbox's point of view.
 *
 * Who answers is settled here rather than in the assistant: a message lands,
 * and either a reply job is queued or the thread is flagged for staff. Nothing
 * is left in between, which is the state an inbox cannot afford — a message
 * nobody thinks is theirs.
 */
@Injectable()
export class FacebookIntakeService {
  private readonly logger = new Logger(FacebookIntakeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: FacebookGraphService,
    private readonly aiConfig: AiConfigService,
    private readonly config: ConfigService,
    @InjectQueue(FACEBOOK_ASSISTANT_QUEUE) private readonly assistantQueue: Queue,
  ) {}

  async ingest(entry: PageEntry): Promise<void> {
    const events = pageEvents(entry, {
      pageId: this.graph.pageId,
      appId: this.config.get<string>('facebook.appId') ?? '',
    });

    // In order: a burst of messages from one person arrives as one entry, and
    // the thread's "last message" has to end up being the last one.
    for (const event of events) {
      await this.handle(event);
    }
  }

  private async handle(event: PageEvent): Promise<void> {
    switch (event.kind) {
      case 'message':
        return this.inbound(event);
      case 'echo':
        return this.echo(event);
      case 'referral':
        return this.referral(event.psid, event.referral);
      case 'comment':
        return this.comment(event);
      case 'comment_removed':
        await this.prisma.facebookComment.updateMany({
          where: { commentId: event.commentId, status: FacebookCommentStatus.NEW },
          data: { status: FacebookCommentStatus.IGNORED, error: 'Сэтгэгдлийг устгасан' },
        });
        return;
    }
  }

  // ─── Messenger ──────────────────────────────────────────────────────────────

  private async inbound(event: Extract<PageEvent, { kind: 'message' }>): Promise<void> {
    const thread = await this.thread(event.psid, event.at);

    const stored = await this.insertOnce({
      threadId: thread.id,
      mid: event.mid,
      sender: FacebookSender.CONTACT,
      text: event.text,
      attachments: event.attachments as unknown as Prisma.InputJsonValue,
      createdAt: event.at,
    });
    if (!stored) return;

    const config = await this.aiConfig.get();
    const answerable = Boolean(event.text?.trim());
    // The assistant reads words. A photo of a transcript or a voice note is a
    // person's job, and saying "би зураг харж чадахгүй" to it is worse than
    // waiting for one.
    const assistantWillAnswer = answerable && assistantActive(thread, config);

    await this.prisma.facebookThread.update({
      where: { id: thread.id },
      data: {
        lastInboundAt: laterOf(thread.lastInboundAt, event.at),
        ...(isNewest(thread, event.at)
          ? {
              lastMessageAt: event.at,
              lastMessagePreview: preview(event.text, event.attachments),
              lastSender: FacebookSender.CONTACT,
            }
          : {}),
        unreadCount: { increment: 1 },
        needsStaff: !assistantWillAnswer,
        ...(event.referral && !thread.referral ? { referral: event.referral } : {}),
      },
    });

    if (assistantWillAnswer) await this.queueReply(thread.id);
  }

  /**
   * The Page's own message, reported back.
   *
   * Ours already has its row — the sender wrote it with the id the Send API
   * returned — so the echo is a no-op. One we did not send was typed by a
   * person in Business Suite or the Facebook app, and that is a human taking
   * the conversation: it is stored so the inbox and the assistant both see it,
   * and the assistant steps back for the configured pause — unless it came
   * within seconds of the contact's message, which makes it Business Suite's
   * automation (`isAutomatedEcho`), shown in the thread but pausing nothing.
   */
  private async echo(event: Extract<PageEvent, { kind: 'echo' }>): Promise<void> {
    if (event.ours) return;

    const thread = await this.thread(event.psid, event.at);
    const stored = await this.insertOnce({
      threadId: thread.id,
      mid: event.mid,
      sender: FacebookSender.PAGE,
      text: event.text,
      attachments: event.attachments as unknown as Prisma.InputJsonValue,
      createdAt: event.at,
    });
    if (!stored) return;

    const automated = isAutomatedEcho(thread.lastInboundAt, event.at);
    const config = await this.aiConfig.get();
    await this.prisma.facebookThread.update({
      where: { id: thread.id },
      data: {
        ...(isNewest(thread, event.at)
          ? {
              lastMessageAt: event.at,
              lastMessagePreview: preview(event.text, event.attachments),
              lastSender: FacebookSender.PAGE,
            }
          : {}),
        ...(automated
          ? {}
          : {
              needsStaff: false,
              aiPausedUntil: new Date(event.at.getTime() + config.facebookStaffPauseHours * HOUR_MS),
            }),
      },
    });
  }

  /** An ad or m.me link opened (or re-opened) the thread. First touch wins. */
  private async referral(psid: string, referral: Record<string, string>): Promise<void> {
    const thread = await this.thread(psid, new Date());
    if (thread.referral) return;
    await this.prisma.facebookThread.update({ where: { id: thread.id }, data: { referral } });
  }

  /**
   * The thread for this person, made on first contact.
   *
   * The profile is asked for once, at creation, and failing to get it is
   * fine: plenty of people's settings hide it, and a thread without a name is
   * still a thread. Created with an upsert because two entries for one new
   * person can be in flight at once (a retried webhook beside the original).
   */
  private async thread(psid: string, at: Date): Promise<FacebookThread> {
    const existing = await this.prisma.facebookThread.findUnique({ where: { psid } });
    if (existing) return existing;

    const profile = await this.graph.profile(psid);
    return this.prisma.facebookThread.upsert({
      where: { psid },
      // Dated by the message that opened it, so that message counts as the newest.
      create: { psid, name: profile?.name ?? null, profilePic: profile?.profilePic ?? null, lastMessageAt: at },
      update: {},
    });
  }

  /**
   * Inserts a message unless Meta's id is already stored. False = duplicate.
   *
   * `ON CONFLICT DO NOTHING` rather than catching P2002: a duplicate is the
   * normal case for a retried webhook, and the client logs every failed
   * statement as an error before the catch ever sees it.
   */
  private async insertOnce(data: Prisma.FacebookMessageCreateManyInput): Promise<boolean> {
    const { count } = await this.prisma.facebookMessage.createMany({ data: [data], skipDuplicates: true });
    return count === 1;
  }

  /**
   * One pending reply per thread. A second message inside the debounce finds
   * the job already waiting and is answered by it — the job reads everything
   * unanswered when it runs, not what was there when it was queued.
   */
  async queueReply(threadId: string, delay: number = FACEBOOK_REPLY_DEBOUNCE_MS): Promise<void> {
    await this.assistantQueue.add(FACEBOOK_REPLY_JOB, { threadId } satisfies FacebookReplyJob, {
      jobId: `reply-${threadId}`,
      delay,
      attempts: 2,
      backoff: { type: 'fixed', delay: 10_000 },
      // Both, because the id is reused: a finished or failed job left in Redis
      // under `reply-<thread>` would swallow every later reply for that thread.
      removeOnComplete: true,
      removeOnFail: true,
    });
  }

  // ─── comments ───────────────────────────────────────────────────────────────

  private async comment(event: Extract<PageEvent, { kind: 'comment' }>): Promise<void> {
    const answerable = isAnswerableComment(event.text);

    const { count } = await this.prisma.facebookComment.createMany({
      skipDuplicates: true,
      data: [
        {
          commentId: event.commentId,
          postId: event.postId,
          parentId: event.parentId,
          fromId: event.fromId,
          fromName: event.fromName,
          text: event.text,
          status: answerable ? FacebookCommentStatus.NEW : FacebookCommentStatus.IGNORED,
          createdAt: event.at,
        },
      ],
    });
    if (count === 0 || !answerable) return;

    const created = await this.prisma.facebookComment.findUniqueOrThrow({
      where: { commentId: event.commentId },
      select: { id: true },
    });

    const config = await this.aiConfig.get();
    if (!config.enabled || !config.facebookCommentsEnabled) return;

    await this.assistantQueue.add(FACEBOOK_COMMENT_JOB, { commentId: created.id } satisfies FacebookCommentJob, {
      jobId: `comment-${created.id}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 15_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
    this.logger.log(`Facebook сэтгэгдэл ${event.commentId} → AI хариулна`);
  }
}

function laterOf(current: Date | null, next: Date): Date {
  return current && current.getTime() > next.getTime() ? current : next;
}

/** Whether a Page echo is Business Suite's automation rather than a person (see the window above). */
export function isAutomatedEcho(lastInboundAt: Date | null, at: Date): boolean {
  if (!lastInboundAt) return false;
  const gap = at.getTime() - lastInboundAt.getTime();
  return gap >= 0 && gap <= AUTOMATED_ECHO_WINDOW_MS;
}

/** Webhooks can arrive out of order; only a newer message moves the preview. */
function isNewest(thread: { lastMessageAt: Date }, at: Date): boolean {
  return at.getTime() >= thread.lastMessageAt.getTime();
}
