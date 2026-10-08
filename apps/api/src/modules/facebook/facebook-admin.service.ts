import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AccessLevel,
  FacebookAiMode,
  FacebookCommentStatus,
  FacebookSender,
  KnowledgeCategory,
  KnowledgeKind,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Prisma,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AiConfigService } from '../ai/ai-config.service.js';
import { KnowledgeService } from '../ai/knowledge/knowledge.service.js';
import { LeadsService } from '../leads/leads.service.js';
import type { CreateLeadDto } from '../leads/dto/create-lead.dto.js';
import type {
  CreateLeadFromThreadDto,
  LinkFacebookThreadDto,
  QueryFacebookCommentsDto,
  QueryFacebookThreadsDto,
  ReplyFacebookCommentDto,
  SetFacebookAiDto,
} from './dto/facebook.dto.js';
import { FacebookGraphError, FacebookGraphService } from './facebook-graph.service.js';
import { assistantActive, messagingWindow, preview } from './facebook-rules.js';
import type { FacebookAttachmentRow } from './facebook.types.js';

const HOUR_MS = 60 * 60 * 1000;

/** How much of a thread the inbox loads. A Messenger thread rarely runs longer. */
const THREAD_MESSAGES = 200;

const THREAD_INCLUDE = {
  lead: { select: { id: true, firstName: true, lastName: true, phone: true, stage: true } },
  client: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
} satisfies Prisma.FacebookThreadInclude;

type ThreadRow = Prisma.FacebookThreadGetPayload<{ include: typeof THREAD_INCLUDE }>;

/**
 * `/admin/facebook` (2F) — the Page's inbox for staff.
 *
 * Separate from the 1K messenger on purpose: those are clients with accounts,
 * writing from the portal, owed an answer by a named consultant; these are
 * strangers on Facebook, most of whom the assistant answers and some of whom
 * become leads. The two inboxes share no table and no queue.
 *
 * A person writing here always outranks the assistant. Every staff message
 * pauses it in that thread, the same way a reply typed in Business Suite does.
 */
@Injectable()
export class FacebookAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: FacebookGraphService,
    private readonly aiConfig: AiConfigService,
    private readonly leads: LeadsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async status() {
    const config = await this.aiConfig.get();
    return {
      configured: this.graph.configured,
      mock: this.graph.mock,
      pageId: this.graph.pageId || null,
      assistantEnabled: config.enabled,
      facebookEnabled: config.facebookEnabled,
      facebookCommentsEnabled: config.facebookCommentsEnabled,
      facebookCommentReply: config.facebookCommentReply,
      facebookStaffPauseHours: config.facebookStaffPauseHours,
    };
  }

  // ─── threads ────────────────────────────────────────────────────────────────

  async list(query: QueryFacebookThreadsDto) {
    const now = new Date();
    const where = this.threadWhere(query, now);

    // Read-only, so `Promise.all` and not `$transaction` (CLAUDE.md rule 9).
    const [items, total, needsStaff, unread, unlinked, comments, config] = await Promise.all([
      this.prisma.facebookThread.findMany({
        where,
        include: THREAD_INCLUDE,
        orderBy: { lastMessageAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
      }),
      this.prisma.facebookThread.count({ where }),
      this.prisma.facebookThread.count({ where: { needsStaff: true } }),
      this.prisma.facebookThread.count({ where: { unreadCount: { gt: 0 } } }),
      this.prisma.facebookThread.count({ where: { leadId: null, clientId: null } }),
      this.prisma.facebookComment.count({
        where: { status: { in: [FacebookCommentStatus.NEW, FacebookCommentStatus.FAILED] } },
      }),
      this.aiConfig.get(),
    ]);

    return {
      items: items.map((row) => this.threadItem(row, config, now)),
      total,
      counts: { needsStaff, unread, unlinked, comments },
    };
  }

  /** One thread, its messages, and what the assistant knows — and it is now read. */
  async detail(id: string) {
    const [thread, messages, config] = await Promise.all([
      this.prisma.facebookThread.findUnique({
        where: { id },
        include: { ...THREAD_INCLUDE, chatSession: { select: { code: true, profile: true } } },
      }),
      this.prisma.facebookMessage.findMany({
        where: { threadId: id },
        orderBy: { createdAt: 'desc' },
        take: THREAD_MESSAGES,
        include: { staff: { select: { name: true, email: true } } },
      }),
      this.aiConfig.get(),
    ]);
    if (!thread) throw new NotFoundException('Facebook чат олдсонгүй');

    if (thread.unreadCount > 0) {
      await this.prisma.facebookThread.update({ where: { id }, data: { unreadCount: 0 } });
      thread.unreadCount = 0;
    }

    return {
      ...this.threadItem(thread, config, new Date()),
      messages: messages.reverse().map((message) => ({
        id: message.id,
        sender: message.sender,
        staffName: message.staff ? (message.staff.name ?? message.staff.email) : null,
        text: message.text,
        attachments: (Array.isArray(message.attachments) ? message.attachments : []) as unknown as FacebookAttachmentRow[],
        status: message.status,
        error: message.error,
        commentId: message.commentId,
        knowledgeDocumentId: message.knowledgeDocumentId,
        createdAt: message.createdAt,
      })),
      aiSessionCode: thread.chatSession?.code ?? null,
      profile: (thread.chatSession?.profile as Record<string, unknown> | null) ?? {},
      referral: (thread.referral as Record<string, unknown> | null) ?? null,
    };
  }

  /**
   * A staff reply, sent as the Page.
   *
   * Meta's window decides how: an ordinary reply within a day of the contact's
   * last message, a human-agent message up to a week, and nothing after that —
   * refused here with the reason, rather than by Meta with a code nobody reads.
   */
  async send(id: string, text: string, staffId: string) {
    const thread = await this.prisma.facebookThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Facebook чат олдсонгүй');

    const window = messagingWindow(thread.lastInboundAt);
    if (window === 'CLOSED') {
      throw new UnprocessableEntityException(
        'Хэрэглэгч сүүлд 7 хоногоос өмнө бичсэн тул Facebook-ийн журмаар мессеж илгээх боломжгүй. Тэр дахин бичихийг хүлээнэ үү.',
      );
    }

    const config = await this.aiConfig.get();
    const pause = new Date(Date.now() + config.facebookStaffPauseHours * HOUR_MS);

    let row;
    try {
      const sent = await this.graph.sendText(thread.psid, text, window === 'OPEN' ? 'RESPONSE' : 'HUMAN_AGENT');
      row = await this.prisma.facebookMessage.create({
        data: { threadId: id, mid: sent.messageId, sender: FacebookSender.STAFF, staffId, text },
        include: { staff: { select: { name: true, email: true } } },
      });
    } catch (error) {
      if (!(error instanceof FacebookGraphError)) throw error;
      row = await this.prisma.facebookMessage.create({
        data: { threadId: id, sender: FacebookSender.STAFF, staffId, text, status: 'FAILED', error: error.staffMessage },
        include: { staff: { select: { name: true, email: true } } },
      });
    }

    if (row.status === 'SENT') {
      await this.prisma.facebookThread.update({
        where: { id },
        data: {
          needsStaff: false,
          aiPausedUntil: pause,
          lastMessageAt: row.createdAt,
          lastMessagePreview: preview(text),
          lastSender: FacebookSender.STAFF,
        },
      });
    }

    return {
      id: row.id,
      sender: row.sender,
      staffName: row.staff ? (row.staff.name ?? row.staff.email) : null,
      text: row.text,
      attachments: [],
      status: row.status,
      error: row.error,
      commentId: null,
      knowledgeDocumentId: null,
      createdAt: row.createdAt,
    };
  }

  /** Switch the assistant off/on for this thread, or lift a staff pause early. */
  async setAi(id: string, dto: SetFacebookAiDto) {
    if (!dto.mode && !dto.resume) throw new BadRequestException('Юуг өөрчлөхөө заана уу');

    const row = await this.prisma.facebookThread.update({
      where: { id },
      data: {
        ...(dto.mode ? { aiMode: dto.mode } : {}),
        ...(dto.resume || dto.mode === FacebookAiMode.AUTO ? { aiPausedUntil: null } : {}),
      },
      include: THREAD_INCLUDE,
    });

    return this.threadItem(row, await this.aiConfig.get(), new Date());
  }

  /**
   * Ties the thread to who this person is in the CRM.
   *
   * The assistant's session follows: a thread linked to a lead must not let
   * the assistant file a second one, so the lead is written onto the session
   * too. The lead's history gets a line, because "this person also writes to
   * us on Facebook" is something the consultant on the phone wants to know.
   */
  async link(id: string, dto: LinkFacebookThreadDto, actorId: string) {
    const thread = await this.prisma.facebookThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Facebook чат олдсонгүй');

    if (dto.leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: dto.leadId }, select: { id: true } });
      if (!lead) throw new BadRequestException('Сэжим олдсонгүй');
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId }, select: { id: true } });
      if (!client) throw new BadRequestException('Үйлчлүүлэгч олдсонгүй');
    }

    const row = await this.prisma.facebookThread.update({
      where: { id },
      data: {
        ...(dto.leadId !== undefined ? { leadId: dto.leadId } : {}),
        ...(dto.clientId !== undefined ? { clientId: dto.clientId } : {}),
      },
      include: THREAD_INCLUDE,
    });

    if (row.chatSessionId && dto.leadId) {
      await this.prisma.chatSession.update({ where: { id: row.chatSessionId }, data: { leadId: dto.leadId } });
    }

    if (dto.leadId && dto.leadId !== thread.leadId) {
      await this.prisma.leadActivity.create({
        data: {
          leadId: dto.leadId,
          type: LeadActivityType.CHAT,
          body: `Facebook Messenger чат холбогдлоо${thread.name ? ` (${thread.name})` : ''}`,
          meta: { channel: 'facebook_messenger', threadId: id } satisfies Prisma.InputJsonObject,
          actorId,
        },
      });
    }

    return this.threadItem(row, await this.aiConfig.get(), new Date());
  }

  /** A lead made from the thread by staff, already linked to it. */
  async createLead(id: string, dto: CreateLeadFromThreadDto, actorId: string) {
    const thread = await this.prisma.facebookThread.findUnique({ where: { id } });
    if (!thread) throw new NotFoundException('Facebook чат олдсонгүй');
    if (thread.leadId) throw new BadRequestException('Энэ чат аль хэдийн сэжимтэй холбогдсон байна');

    const lead = await this.leads.createByStaff(
      {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        note: dto.note || `Facebook Messenger-ээс${thread.name ? ` — ${thread.name}` : ''}`,
        source: LeadSource.SOCIAL,
        // They are already talking to us — that is past "new".
        stage: LeadStage.CONTACTED,
      } as CreateLeadDto,
      actorId,
    );

    return this.link(id, { leadId: lead.id }, actorId);
  }

  async candidates(search: string) {
    const term = search.trim();
    const contains = { contains: term, mode: 'insensitive' as const };

    const [leads, clients] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          mergedIntoId: null,
          OR: [{ firstName: contains }, { lastName: contains }, { phone: { contains: term.replace(/\D/g, '') || term } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, firstName: true, lastName: true, phone: true, stage: true },
      }),
      this.prisma.client.findMany({
        where: {
          OR: [
            { firstName: contains },
            { lastName: contains },
            { code: contains },
            { phone: { contains: term.replace(/\D/g, '') || term } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, code: true, firstName: true, lastName: true, phone: true },
      }),
    ]);

    return [
      ...clients.map((client) => ({
        kind: 'CLIENT' as const,
        id: client.id,
        name: fullName(client),
        phone: client.phone,
        detail: client.code,
      })),
      ...leads.map((lead) => ({
        kind: 'LEAD' as const,
        id: lead.id,
        name: fullName(lead),
        phone: lead.phone,
        detail: lead.stage,
      })),
    ];
  }

  /**
   * A staff reply, turned into a draft answer card for the assistant.
   *
   * This is how the Page's conversations feed the knowledge base: the question
   * is what the contact wrote since the previous answer, the answer is what a
   * person told them. A draft, never published from here — somebody reads it
   * in `/admin/ai/knowledge` first, because a reply to one person ("таны
   * хувьд…") is not yet an answer to everybody.
   */
  async toKnowledge(messageId: string, actorId: string) {
    const message = await this.prisma.facebookMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Мессеж олдсонгүй');
    if (message.sender !== FacebookSender.STAFF && message.sender !== FacebookSender.PAGE) {
      throw new BadRequestException('Зөвхөн ажилтны бичсэн хариултыг мэдлэгийн санд нэмнэ');
    }
    if (!message.text?.trim()) throw new BadRequestException('Хоосон мессеж');
    if (message.knowledgeDocumentId) return { documentId: message.knowledgeDocumentId };

    const previousAnswer = await this.prisma.facebookMessage.findFirst({
      where: { threadId: message.threadId, sender: { not: FacebookSender.CONTACT }, createdAt: { lt: message.createdAt } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const asked = await this.prisma.facebookMessage.findMany({
      where: {
        threadId: message.threadId,
        sender: FacebookSender.CONTACT,
        text: { not: null },
        createdAt: { lt: message.createdAt, ...(previousAnswer ? { gt: previousAnswer.createdAt } : {}) },
      },
      orderBy: { createdAt: 'asc' },
      take: 6,
      select: { text: true },
    });

    const question = asked.map((row) => row.text!.trim()).filter(Boolean).join('\n') || message.text.slice(0, 200);

    const document = await this.knowledge.create(
      {
        title: question.replace(/\s+/g, ' ').slice(0, 120),
        kind: KnowledgeKind.ENTRY,
        category: KnowledgeCategory.FAQ,
        accessLevel: AccessLevel.PUBLIC,
        question,
        body: message.text,
      },
      actorId,
    );

    await this.prisma.facebookMessage.update({ where: { id: messageId }, data: { knowledgeDocumentId: document.id } });
    return { documentId: document.id };
  }

  /**
   * Deletes everything the Page holds about one person (2F, `/data-deletion`).
   *
   * The thread's messages go with it (cascade), and so do the comments its
   * private replies came from and the assistant's sessions — the comment one
   * and the thread's own. A lead stays: that is CRM data the person asked us to
   * create, governed by the privacy policy, and the deletion page says it is
   * removed only when they ask for it too.
   */
  async deleteThread(id: string): Promise<void> {
    const thread = await this.prisma.facebookThread.findUnique({
      where: { id },
      select: { id: true, psid: true, chatSessionId: true, comments: { select: { fromId: true } } },
    });
    if (!thread) throw new NotFoundException('Facebook чат олдсонгүй');

    const fromIds = [...new Set(thread.comments.map((comment) => comment.fromId))];
    const anonymousIds = [`fb:${thread.psid}`, ...fromIds.map((fromId) => `fb-comment:${fromId}`)];

    await this.prisma.$transaction([
      this.prisma.facebookComment.deleteMany({
        where: { OR: [{ threadId: id }, ...(fromIds.length ? [{ fromId: { in: fromIds } }] : [])] },
      }),
      this.prisma.facebookThread.delete({ where: { id } }),
      this.prisma.chatSession.deleteMany({
        where: {
          channel: 'FACEBOOK',
          OR: [
            ...(thread.chatSessionId ? [{ id: thread.chatSessionId }] : []),
            { anonymousId: { in: anonymousIds } },
          ],
        },
      }),
    ]);
  }

  // ─── comments ───────────────────────────────────────────────────────────────

  async comments(query: QueryFacebookCommentsDto) {
    const where: Prisma.FacebookCommentWhereInput = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      this.prisma.facebookComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit ?? 50,
        skip: query.offset ?? 0,
        include: { repliedBy: { select: { name: true, email: true } } },
      }),
      this.prisma.facebookComment.count({ where }),
    ]);

    return { items: items.map(commentItem), total };
  }

  async replyToComment(id: string, dto: ReplyFacebookCommentDto, staffId: string) {
    const comment = await this.prisma.facebookComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Сэтгэгдэл олдсонгүй');

    try {
      if (dto.private) {
        if (comment.privateRepliedAt) {
          throw new BadRequestException('Энэ сэтгэгдэлд хувийн хариу аль хэдийн илгээсэн — Facebook нэг л удаа зөвшөөрдөг');
        }
        const sent = await this.graph.privateReply(comment.commentId, dto.text);
        const thread = await this.prisma.facebookThread.upsert({
          where: { psid: sent.recipientId },
          create: { psid: sent.recipientId, name: comment.fromName },
          update: {},
        });
        await this.prisma.facebookMessage.create({
          data: {
            threadId: thread.id,
            mid: sent.messageId,
            sender: FacebookSender.STAFF,
            staffId,
            text: dto.text,
            commentId: comment.commentId,
          },
        });
        await this.prisma.facebookThread.update({
          where: { id: thread.id },
          data: { lastMessageAt: new Date(), lastMessagePreview: preview(dto.text), lastSender: FacebookSender.STAFF },
        });
        await this.prisma.facebookComment.update({
          where: { id },
          data: { privateRepliedAt: new Date(), threadId: thread.id },
        });
      } else {
        const replyId = await this.graph.replyToComment(comment.commentId, dto.text);
        await this.prisma.facebookComment.update({
          where: { id },
          data: { publicReplyId: replyId, publicReplyText: dto.text },
        });
      }
    } catch (error) {
      if (error instanceof FacebookGraphError) throw new UnprocessableEntityException(error.staffMessage);
      throw error;
    }

    const row = await this.prisma.facebookComment.update({
      where: { id },
      data: { status: FacebookCommentStatus.STAFF_REPLIED, repliedById: staffId, error: null },
      include: { repliedBy: { select: { name: true, email: true } } },
    });
    return commentItem(row);
  }

  async ignoreComment(id: string) {
    const row = await this.prisma.facebookComment.update({
      where: { id },
      data: { status: FacebookCommentStatus.IGNORED },
      include: { repliedBy: { select: { name: true, email: true } } },
    });
    return commentItem(row);
  }

  // ─── mapping ────────────────────────────────────────────────────────────────

  private threadWhere(query: QueryFacebookThreadsDto, now: Date): Prisma.FacebookThreadWhereInput {
    const and: Prisma.FacebookThreadWhereInput[] = [];

    if (query.leadId) and.push({ leadId: query.leadId });
    if (query.clientId) and.push({ clientId: query.clientId });

    // An explicit lead/client lookup is "is there a thread for this person",
    // and the default inbox filter would hide the answer.
    const scope = query.scope ?? (query.leadId || query.clientId ? 'ALL' : 'NEEDS_STAFF');
    if (scope === 'NEEDS_STAFF') and.push({ needsStaff: true });
    if (scope === 'UNLINKED') and.push({ leadId: null, clientId: null });
    if (scope === 'AI') {
      and.push({ aiMode: FacebookAiMode.AUTO, OR: [{ aiPausedUntil: null }, { aiPausedUntil: { lte: now } }] });
    }

    const term = query.search?.trim();
    if (term) {
      const contains = { contains: term, mode: 'insensitive' as const };
      and.push({
        OR: [
          { name: contains },
          { lastMessagePreview: contains },
          { lead: { OR: [{ firstName: contains }, { lastName: contains }, { phone: { contains: term } }] } },
          { client: { OR: [{ firstName: contains }, { lastName: contains }, { code: contains }, { phone: { contains: term } }] } },
        ],
      });
    }

    return and.length ? { AND: and } : {};
  }

  private threadItem(
    row: ThreadRow,
    config: { enabled: boolean; facebookEnabled: boolean },
    now: Date,
  ) {
    return {
      id: row.id,
      psid: row.psid,
      name: row.name,
      profilePic: row.profilePic,
      aiMode: row.aiMode,
      aiPausedUntil: row.aiPausedUntil && row.aiPausedUntil > now ? row.aiPausedUntil : null,
      aiActive: assistantActive(row, config, now),
      needsStaff: row.needsStaff,
      unreadCount: row.unreadCount,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      lastSender: row.lastSender,
      window: messagingWindow(row.lastInboundAt, now),
      lead: row.lead
        ? { id: row.lead.id, name: fullName(row.lead), phone: row.lead.phone, stage: row.lead.stage }
        : null,
      client: row.client
        ? { id: row.client.id, code: row.client.code, name: fullName(row.client), phone: row.client.phone }
        : null,
    };
  }
}

function fullName(person: { firstName: string; lastName: string }): string {
  // The assistant writes "—" for a half of the name nobody said.
  return [person.lastName, person.firstName].filter((part) => part && part !== '—').join(' ') || '—';
}

function commentItem(
  row: Prisma.FacebookCommentGetPayload<{ include: { repliedBy: { select: { name: true; email: true } } } }>,
) {
  return {
    id: row.id,
    commentId: row.commentId,
    postId: row.postId,
    postMessage: row.postMessage,
    postPermalink: row.postPermalink,
    fromName: row.fromName,
    text: row.text,
    status: row.status,
    error: row.error,
    publicReplyText: row.publicReplyText,
    privateRepliedAt: row.privateRepliedAt,
    threadId: row.threadId,
    repliedByName: row.repliedBy ? (row.repliedBy.name ?? row.repliedBy.email) : null,
    createdAt: row.createdAt,
  };
}
