import { Injectable, Logger } from '@nestjs/common';
import { FacebookSender, LeadStage, type FacebookFollowUp } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import {
  NUDGE_AFTER_MS,
  dueFollowUp,
  followUpText,
  followUpTopic,
  type FollowUpMessage,
  type FollowUpTopic,
} from './facebook-follow-up.js';
import { FacebookGraphError, FacebookGraphService } from './facebook-graph.service.js';
import { isAutomatedEcho } from './facebook-intake.service.js';
import { STANDARD_WINDOW_MS, assistantActive, preview } from './facebook-rules.js';

/** A lead the office has finished with — signed or lost — is not marketed to. */
const CLOSED_STAGES: LeadStage[] = [LeadStage.WON, LeadStage.LOST, LeadStage.CONTRACT_PENDING];

export interface PlannedFollowUp {
  threadId: string;
  name: string | null;
  kind: FacebookFollowUp;
  topic: FollowUpTopic;
  text: string;
  /** The contact's last message the plan was made on; a newer one cancels it. */
  lastInboundAt: Date;
}

/**
 * Writes into Messenger threads that went quiet (2G-07, `facebook-follow-up.ts`
 * has the rules). A sweep rather than a job per thread: whether a follow-up is
 * due depends on everything that happened since — a reply, a person taking
 * over, a booking, a "хэрэггүй" — and re-reading the thread is the only way
 * not to act on a plan the conversation has already overtaken.
 */
@Injectable()
export class FacebookFollowUpService {
  private readonly logger = new Logger(FacebookFollowUpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiConfig: AiConfigService,
    private readonly graph: FacebookGraphService,
  ) {}

  /** Sends what is due, or with `dry` only says what it would send. */
  async sweep(options: { dry?: boolean; now?: Date } = {}): Promise<PlannedFollowUp[]> {
    const now = options.now ?? new Date();
    const config = await this.aiConfig.get();
    if (!options.dry && !config.facebookFollowUpEnabled) return [];

    const threads = await this.prisma.facebookThread.findMany({
      where: {
        aiMode: 'AUTO',
        needsStaff: false,
        followUpOptOut: false,
        clientId: null,
        lastInboundAt: {
          gt: new Date(now.getTime() - STANDARD_WINDOW_MS),
          lte: new Date(now.getTime() - NUDGE_AFTER_MS),
        },
      },
      include: { chatSession: { select: { leadId: true, profile: true } } },
    });

    const planned: PlannedFollowUp[] = [];
    // One at a time: a handful of threads every five minutes, and a burst of
    // sends from one Page is what Meta's rate limits notice.
    for (const thread of threads) {
      if (!assistantActive(thread, config, now)) continue;

      const plan = await this.plan(thread, now);
      if (!plan) continue;
      planned.push(plan);
      if (!options.dry) await this.send(thread.id, plan);
    }

    return planned;
  }

  private async plan(
    thread: {
      id: string;
      name: string | null;
      lastInboundAt: Date | null;
      needsStaff: boolean;
      followUpOptOut: boolean;
      leadId: string | null;
      chatSession: { leadId: string | null; profile: unknown } | null;
    },
    now: Date,
  ): Promise<PlannedFollowUp | null> {
    const lastInbound = thread.lastInboundAt!;
    const leadId = thread.leadId ?? thread.chatSession?.leadId ?? null;

    const [rows, followUps, lead] = await Promise.all([
      this.prisma.facebookMessage.findMany({
        where: {
          threadId: thread.id,
          createdAt: { gt: new Date(lastInbound.getTime() - STANDARD_WINDOW_MS) },
          // A failed follow-up still counts — retrying it every five minutes
          // is how a Page gets rate-limited.
          OR: [{ status: 'SENT' }, { followUp: { not: null } }],
        },
        orderBy: { createdAt: 'asc' },
        select: { sender: true, text: true, attachments: true, followUp: true, createdAt: true },
      }),
      this.prisma.facebookMessage.findMany({
        where: { threadId: thread.id, followUp: { not: null } },
        select: { followUp: true, createdAt: true },
      }),
      leadId
        ? this.prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true } })
        : Promise.resolve(null),
    ]);

    const contactTimes = rows.filter((row) => row.sender === FacebookSender.CONTACT).map((row) => row.createdAt);
    const messages: FollowUpMessage[] = rows.map((row) => ({
      sender: row.sender,
      text: row.text,
      attachments: Array.isArray(row.attachments) ? (row.attachments as { type: string }[]) : [],
      followUp: row.followUp,
      automated:
        row.sender === FacebookSender.PAGE && contactTimes.some((at) => isAutomatedEcho(at, row.createdAt)),
      createdAt: row.createdAt,
    }));

    const kind = dueFollowUp(
      {
        lastInboundAt: lastInbound,
        needsStaff: thread.needsStaff,
        followUpOptOut: thread.followUpOptOut,
        booked: Boolean(leadId),
        excluded: Boolean(lead && CLOSED_STAGES.includes(lead.stage)),
      },
      messages,
      followUps.map((row) => ({ kind: row.followUp!, at: row.createdAt })),
      now,
    );
    if (!kind) return null;

    const profile = (thread.chatSession?.profile ?? {}) as { goalLevel?: string };
    const topic = followUpTopic(
      rows.filter((row) => row.sender === FacebookSender.CONTACT && row.text).map((row) => row.text!),
      profile.goalLevel,
    );

    return {
      threadId: thread.id,
      name: thread.name,
      kind,
      topic,
      text: followUpText(kind, topic),
      lastInboundAt: lastInbound,
    };
  }

  private async send(threadId: string, plan: PlannedFollowUp): Promise<void> {
    // The person may have written, or somebody switched the assistant off,
    // since the plan was made.
    const current = await this.prisma.facebookThread.findUnique({ where: { id: threadId } });
    const config = await this.aiConfig.get();
    if (!current || current.needsStaff || current.followUpOptOut || !assistantActive(current, config)) return;
    if (current.lastInboundAt?.getTime() !== plan.lastInboundAt.getTime()) return;

    try {
      const sent = await this.graph.sendText(current.psid, plan.text, 'UPDATE');
      await this.prisma.facebookMessage.create({
        data: { threadId, mid: sent.messageId, sender: FacebookSender.AI, text: plan.text, followUp: plan.kind },
      });
      await this.prisma.facebookThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date(), lastMessagePreview: preview(plan.text), lastSender: FacebookSender.AI },
      });
      this.logger.log(`Messenger follow-up ${plan.kind} (${plan.topic}) → ${threadId}`);
    } catch (error) {
      const message = error instanceof FacebookGraphError ? error.staffMessage : String(error);
      this.logger.warn(`Messenger follow-up илгээж чадсангүй (${threadId}): ${message}`);
      await this.prisma.facebookMessage.create({
        data: { threadId, sender: FacebookSender.AI, text: plan.text, followUp: plan.kind, status: 'FAILED', error: message },
      });
    }
  }
}
