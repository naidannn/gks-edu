import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { activeStaffWhere, isStaff } from '../../common/constants/roles.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { nextYearlyCode } from '../../common/utils/yearly-code.js';
import {
  ConversationStatus,
  ConversationTopic,
  MessageKind,
  NotificationEvent,
  Prisma,
  Role,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SlackService } from '../notifications/slack.service.js';
import {
  AssignConversationDto,
  InboxScope,
  QueryInboxDto,
  QueryMessagesDto,
  QueryMyConversationsDto,
  SendMessageDto,
  StartConversationDto,
} from './dto/messenger.dto.js';
import { MessengerEventsService } from './messenger-events.service.js';
import {
  CONVERSATION_DETAIL_SELECT,
  CONVERSATION_SELECT,
  MESSAGE_SELECT,
  type ConversationDetailRow,
  type ConversationRow,
  type MessageRow,
} from './messenger.select.js';

/** How much of a message the list row shows. Matches the column width. */
const PREVIEW_LENGTH = 200;

/**
 * A thread the desk still owes an answer on (1N-42).
 *
 * The status matters: a resolved thread has left the open inbox, so counting it
 * in the navigation badge asks staff to find something that is no longer on the
 * screen they would look at. `setStatus` clears the counter when resolving, and
 * this filter catches anything resolved before that fix, or by another route.
 */
const STAFF_UNREAD_WHERE: Prisma.ConversationWhereInput = {
  staffUnread: { gt: 0 },
  status: { not: ConversationStatus.RESOLVED },
};

/** Fallback subject when the client just started typing without naming it. */
const SUBJECT_FALLBACK_LENGTH = 60;

type Db = Prisma.TransactionClient | PrismaService;

/**
 * 1K — the messenger.
 *
 * A client writes, a consultant answers, and both sides see it happen. Three
 * things here are load-bearing:
 *
 * 1. **The inbox is shared.** A thread arrives unassigned and any staff member
 *    can claim it; answering claims it implicitly, because nobody has ever
 *    remembered to press a button first. That is why `staffUnread` is one
 *    counter for all of them rather than a row per staff member.
 * 2. **`fromStaff` is frozen on the message**, not derived from the sender's
 *    current role — a consultant who is later made an admin must not have
 *    their old lines change sides.
 * 3. **A bell is only for somebody who is not looking.** The dispatcher runs
 *    when the recipient is not watching the thread; when they are, the live
 *    stream already put the message on their screen.
 */
@Injectable()
export class MessengerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MessengerEventsService,
    private readonly notifications: NotificationsService,
    private readonly slack: SlackService,
  ) {}

  // ── Client side ───────────────────────────────────────────────────────────

  async listMine(userId: string, query: QueryMyConversationsDto) {
    const where: Prisma.ConversationWhereInput = {
      clientUserId: userId,
      ...(query.status ? { status: query.status } : {}),
    };

    // Read-only pair under Promise.all, never $transaction (CLAUDE.md §8).
    const [rows, total, unreadThreads] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: CONVERSATION_SELECT,
      }),
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.count({ where: { clientUserId: userId, clientUnread: { gt: 0 } } }),
    ]);

    return {
      ...paginate(rows.map((row) => this.toListItem(row, false)), total, query.page, query.limit),
      unreadThreads,
    };
  }

  /**
   * Opens a thread and posts its first message in one go. There is no empty
   * conversation in this system: a thread with nothing in it is a row nobody
   * can act on, and the client's first sentence is the only subject worth
   * having when they did not type one.
   */
  async start(user: AuthenticatedUser, dto: StartConversationDto) {
    if (isStaff(user.role)) {
      throw new ForbiddenException('Ажилтан өөртэйгөө чат эхлүүлэх боломжгүй');
    }

    if (dto.caseId) {
      const owned = await this.prisma.case.findFirst({
        where: { id: dto.caseId, userId: user.id },
        select: { id: true },
      });
      if (!owned) throw new NotFoundException('Үйлчилгээ олдсонгүй');
    }

    const subject = dto.subject?.trim() || truncate(dto.body, SUBJECT_FALLBACK_LENGTH);

    const { conversation, message } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          code: await this.generateCode(tx),
          clientUserId: user.id,
          caseId: dto.caseId ?? null,
          subject,
          topic: dto.topic ?? ConversationTopic.GENERAL,
          lastMessageAt: new Date(),
          lastMessagePreview: preview(dto.body),
          lastMessageFromStaff: false,
          staffUnread: 1,
          clientReadAt: new Date(),
        },
        select: { id: true },
      });

      const first = await tx.message.create({
        data: {
          conversationId: created.id,
          senderId: user.id,
          fromStaff: false,
          body: dto.body,
          clientToken: dto.clientToken ?? null,
        },
        select: MESSAGE_SELECT,
      });

      const detail = await tx.conversation.findUniqueOrThrow({
        where: { id: created.id },
        select: CONVERSATION_DETAIL_SELECT,
      });

      return { conversation: detail, message: first };
    });

    this.fanOut(conversation, message, { toStaff: true, toUserIds: [user.id] });
    await this.pingOffice(conversation, dto.body, true);

    return { conversation: this.toDetail(conversation, false), message: this.toMessage(message) };
  }

  // ── Both sides ────────────────────────────────────────────────────────────

  /**
   * A page of messages, newest last, plus the thread head. Opening a thread is
   * also the act of reading it, so this clears the caller's unread count —
   * a separate "mark read" call would be a round trip that always follows.
   */
  async messages(user: AuthenticatedUser, conversationId: string, query: QueryMessagesDto) {
    const conversation = await this.load(conversationId, user);
    const staffView = isStaff(user.role);

    const cursor = query.before
      ? await this.prisma.message.findFirst({
          where: { id: query.before, conversationId },
          select: { createdAt: true },
        })
      : null;

    if (query.before && !cursor) throw new BadRequestException('Курсор олдсонгүй');

    // One extra row tells us whether an older page exists without a count.
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit + 1,
      select: MESSAGE_SELECT,
    });

    const page = rows.slice(0, query.limit).reverse();
    const nextBefore = rows.length > query.limit ? (page[0]?.id ?? null) : null;

    // The thread is already loaded; `markRead` would fetch it a second time.
    const read = await this.markReadOn(conversation, user);
    this.events.markWatching(conversationId, user.id);

    return {
      conversation: this.toDetail(read ?? conversation, staffView),
      items: page.map((row) => this.toMessage(row)),
      nextBefore,
    };
  }

  /** Appends to an existing thread. The caller's side is decided by their role. */
  async send(user: AuthenticatedUser, conversationId: string, dto: SendMessageDto) {
    const conversation = await this.load(conversationId, user);
    const fromStaff = isStaff(user.role);

    // An idempotent retry after a dropped connection returns the stored row
    // rather than posting the line twice.
    if (dto.clientToken) {
      const existing = await this.prisma.message.findUnique({
        where: { conversationId_clientToken: { conversationId, clientToken: dto.clientToken } },
        select: MESSAGE_SELECT,
      });
      if (existing) return this.toMessage(existing);
    }

    const now = new Date();

    const { message, updated } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: user.id,
          fromStaff,
          body: dto.body,
          clientToken: dto.clientToken ?? null,
        },
        select: MESSAGE_SELECT,
      });

      const next = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: now,
          lastMessagePreview: preview(dto.body),
          lastMessageFromStaff: fromStaff,
          // The side that just spoke has, by definition, read everything.
          ...(fromStaff
            ? {
                clientUnread: { increment: 1 },
                staffUnread: 0,
                staffReadAt: now,
                // Answering is claiming: nobody presses the button first.
                ...(conversation.assignee ? {} : { assigneeId: user.id, assignedAt: now }),
                ...(conversation.firstResponseAt ? {} : { firstResponseAt: now }),
                // Staff replying to a closed thread reopens it; so does the client.
                ...(conversation.status === ConversationStatus.RESOLVED
                  ? { status: ConversationStatus.OPEN, resolvedAt: null, resolvedById: null }
                  : {}),
              }
            : {
                staffUnread: { increment: 1 },
                clientUnread: 0,
                clientReadAt: now,
                ...(conversation.status === ConversationStatus.RESOLVED
                  ? { status: ConversationStatus.OPEN, resolvedAt: null, resolvedById: null }
                  : {}),
              }),
        },
        select: CONVERSATION_DETAIL_SELECT,
      });

      return { message: created, updated: next };
    });

    this.fanOut(updated, message, { toStaff: true, toUserIds: [updated.clientUserId] });

    if (fromStaff) await this.notifyClient(updated, dto.body);
    else await this.pingOffice(updated, dto.body, false);

    return this.toMessage(message);
  }

  /**
   * Clears the caller's side of the unread count. Returns the refreshed row,
   * or null when there was nothing to clear — the common case, and worth not
   * writing for: a thread being read on a poll should not touch the table.
   */
  async markRead(user: AuthenticatedUser, conversationId: string): Promise<ConversationDetailRow | null> {
    return this.markReadOn(await this.load(conversationId, user), user);
  }

  /** The same, for a caller that has already loaded (and so access-checked) the row. */
  private async markReadOn(
    conversation: ConversationDetailRow,
    user: AuthenticatedUser,
  ): Promise<ConversationDetailRow | null> {
    const conversationId = conversation.id;
    const staffView = isStaff(user.role);
    const unread = staffView ? conversation.staffUnread : conversation.clientUnread;
    if (!unread) return null;

    const now = new Date();
    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: staffView ? { staffUnread: 0, staffReadAt: now } : { clientUnread: 0, clientReadAt: now },
      select: CONVERSATION_DETAIL_SELECT,
    });

    // Tell the other side their message was seen, and every one of the
    // reader's own tabs to drop the badge.
    this.events.emit(
      { type: 'read', conversationId, byStaff: staffView, readAt: now },
      { userIds: [updated.clientUserId], staff: true },
    );
    this.events.emit(
      { type: 'conversation', conversationId, conversation: this.toListItem(updated, staffView) },
      staffView ? { staff: true } : { userIds: [updated.clientUserId] },
    );

    return updated;
  }

  /** Badge counts for the nav — one small query per side. */
  async unreadSummary(user: AuthenticatedUser) {
    const staffView = isStaff(user.role);

    const where: Prisma.ConversationWhereInput = staffView
      ? STAFF_UNREAD_WHERE
      // No status filter on the client's side: a resolved thread still carries
      // the staff answer that resolved it, and that is exactly what they should
      // be nudged to read.
      : { clientUserId: user.id, clientUnread: { gt: 0 } };

    const [threads, sum] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.aggregate({
        where,
        _sum: staffView ? { staffUnread: true } : { clientUnread: true },
      }),
    ]);

    return {
      threads,
      messages: (staffView ? sum._sum.staffUnread : sum._sum.clientUnread) ?? 0,
    };
  }

  /**
   * Typing is broadcast, never stored: it is only true for the few seconds
   * between two keystrokes, and a row that stale is worse than no row.
   */
  async setTyping(user: AuthenticatedUser, conversationId: string, typing: boolean): Promise<void> {
    if (!typing) return;
    const conversation = await this.load(conversationId, user);
    const fromStaff = isStaff(user.role);

    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    this.events.markWatching(conversationId, user.id);
    this.events.emit(
      { type: 'typing', conversationId, userId: user.id, name: me?.name ?? null, fromStaff },
      fromStaff ? { userIds: [conversation.clientUserId] } : { staff: true },
    );
  }

  /** The browser says it closed the thread, so a later reply raises a bell again. */
  leave(user: AuthenticatedUser, conversationId: string): void {
    this.events.stopWatching(conversationId, user.id);
  }

  // ── Staff side ────────────────────────────────────────────────────────────

  async inbox(user: AuthenticatedUser, query: QueryInboxDto) {
    const where = this.inboxWhere(user, query);

    const [rows, total, unreadThreads] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        // Unclaimed threads first inside the same view — the queue that is
        // nobody's job is the one that gets left standing.
        orderBy: [{ lastMessageAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: CONVERSATION_DETAIL_SELECT,
      }),
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.count({ where: STAFF_UNREAD_WHERE }),
    ]);

    return {
      ...paginate(rows.map((row) => this.toDetail(row, true)), total, query.page, query.limit),
      unreadThreads,
    };
  }

  /** The four numbers the inbox tabs carry. */
  async inboxCounts(user: AuthenticatedUser) {
    const open = { status: ConversationStatus.OPEN } as const;

    const [unassigned, mine, waiting, total] = await Promise.all([
      this.prisma.conversation.count({ where: { ...open, assigneeId: null } }),
      this.prisma.conversation.count({ where: { ...open, assigneeId: user.id } }),
      this.prisma.conversation.count({ where: { ...open, lastMessageFromStaff: false } }),
      this.prisma.conversation.count({ where: open }),
    ]);

    return { unassigned, mine, waiting, open: total };
  }

  async assign(user: AuthenticatedUser, conversationId: string, dto: AssignConversationDto) {
    // The load is the access check; nothing on the current row is needed here.
    await this.load(conversationId, user);
    const assigneeId = dto.assigneeId ?? null;

    if (assigneeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: assigneeId, ...activeStaffWhere() },
        select: { id: true, name: true },
      });
      if (!assignee) throw new NotFoundException('Ажилтан олдсонгүй');
    }

    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const takenBySelf = assigneeId === user.id;
    const note = assigneeId
      ? takenBySelf
        ? `${staffLabel(me?.name)} энэ чатыг хариуцлаа.`
        : `${staffLabel(me?.name)} чатыг өөр ажилтанд хуваарилав.`
      : `${staffLabel(me?.name)} хариуцагчийг салгав.`;

    const updated = await this.appendSystemLine(conversationId, note, {
      assigneeId,
      assignedAt: assigneeId ? new Date() : null,
    });

    this.fanOut(updated.conversation, updated.message, {
      toStaff: true,
      toUserIds: [updated.conversation.clientUserId],
    });
    return this.toDetail(updated.conversation, true);
  }

  async setStatus(user: AuthenticatedUser, conversationId: string, status: ConversationStatus) {
    const conversation = await this.load(conversationId, user);
    if (conversation.status === status) return this.toDetail(conversation, true);

    const me = await this.prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const resolving = status === ConversationStatus.RESOLVED;
    const note = resolving
      ? `${staffLabel(me?.name)} энэ асуултыг шийдвэрлэсэн гэж тэмдэглэв. Нэмж бичвэл чат дахин нээгдэнэ.`
      : `${staffLabel(me?.name)} чатыг дахин нээв.`;

    const updated = await this.appendSystemLine(conversationId, note, {
      status,
      resolvedAt: resolving ? new Date() : null,
      resolvedById: resolving ? user.id : null,
      // Marking a thread resolved is the strongest possible statement that
      // somebody read it. Without this the badge kept counting a thread that
      // had left the open inbox, and nobody could find what to click (1N-42).
      ...(resolving ? { staffUnread: 0, staffReadAt: new Date() } : {}),
    });

    this.fanOut(updated.conversation, updated.message, {
      toStaff: true,
      toUserIds: [updated.conversation.clientUserId],
    });
    return this.toDetail(updated.conversation, true);
  }

  /** Who a thread can be handed to — the staff picker in the inbox header. */
  async assignableStaff() {
    return this.prisma.user.findMany({
      where: activeStaffWhere(),
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true, email: true, role: true },
    });
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private inboxWhere(user: AuthenticatedUser, query: QueryInboxDto): Prisma.ConversationWhereInput {
    const scope: Prisma.ConversationWhereInput =
      query.scope === InboxScope.UNASSIGNED
        ? { status: ConversationStatus.OPEN, assigneeId: null }
        : query.scope === InboxScope.MINE
          ? { status: ConversationStatus.OPEN, assigneeId: user.id }
          : query.scope === InboxScope.WAITING
            ? { status: ConversationStatus.OPEN, lastMessageFromStaff: false }
            : query.scope === InboxScope.RESOLVED
              ? { status: ConversationStatus.RESOLVED }
              : query.scope === InboxScope.ALL
                ? {}
                : { status: ConversationStatus.OPEN };

    const search = query.search?.trim();
    const term: Prisma.ConversationWhereInput = search
      ? {
          OR: [
            { subject: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
            { clientUser: { name: { contains: search, mode: 'insensitive' } } },
            { clientUser: { email: { contains: search, mode: 'insensitive' } } },
            { clientUser: { phone: { contains: search } } },
            { clientUser: { client: { code: { contains: search, mode: 'insensitive' } } } },
          ],
        }
      : {};

    return { ...scope, ...(query.topic ? { topic: query.topic } : {}), ...term };
  }

  /**
   * The single access check. A client reaches their own threads and nothing
   * else; every staff role reaches all of them, because the inbox is shared.
   */
  private async load(conversationId: string, user: AuthenticatedUser): Promise<ConversationDetailRow> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: CONVERSATION_DETAIL_SELECT,
    });
    if (!conversation) throw new NotFoundException('Чат олдсонгүй');

    if (!isStaff(user.role) && conversation.clientUserId !== user.id) {
      throw new NotFoundException('Чат олдсонгүй');
    }
    return conversation;
  }

  /** A status/assignment change and the line that explains it, written together. */
  private async appendSystemLine(
    conversationId: string,
    body: string,
    // Unchecked: assignment and resolution are written by their scalar
    // foreign keys, which the checked input type does not accept.
    data: Prisma.ConversationUncheckedUpdateInput,
  ): Promise<{ conversation: ConversationDetailRow; message: MessageRow }> {
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: { conversationId, kind: MessageKind.SYSTEM, body, fromStaff: true },
        select: MESSAGE_SELECT,
      });

      const conversation = await tx.conversation.update({
        where: { id: conversationId },
        data: {
          ...data,
          lastMessageAt: now,
          lastMessagePreview: preview(body),
          // A system line owes nobody an answer, so it does not flip the
          // "waiting on us" flag or bump anyone's unread count.
        },
        select: CONVERSATION_DETAIL_SELECT,
      });

      return { conversation, message };
    });
  }

  /** `CH-2026-0007` — "чат". */
  private generateCode(db: Db): Promise<string> {
    return nextYearlyCode('CH', (stem) => db.conversation.count({ where: { code: { startsWith: stem } } }));
  }

  /** Push the new message and the refreshed thread head to everyone concerned. */
  private fanOut(
    conversation: ConversationDetailRow,
    message: MessageRow,
    to: { toStaff: boolean; toUserIds: string[] },
  ): void {
    const target = { userIds: to.toUserIds, staff: to.toStaff };
    this.events.emit({ type: 'message', conversationId: conversation.id, message: this.toMessage(message) }, target);
    // The list row differs per side only in its unread count, so staff and the
    // client each get their own view of the same row.
    this.events.emit(
      {
        type: 'conversation',
        conversationId: conversation.id,
        conversation: this.toListItem(conversation, true),
      },
      { staff: to.toStaff },
    );
    this.events.emit(
      {
        type: 'conversation',
        conversationId: conversation.id,
        conversation: this.toListItem(conversation, false),
      },
      { userIds: to.toUserIds },
    );
  }

  /**
   * A bell for a staff reply, but only when the client is not looking at the
   * thread — the live stream has already delivered it to anyone who is.
   */
  private async notifyClient(conversation: ConversationDetailRow, body: string): Promise<void> {
    if (this.events.isWatching(conversation.id, conversation.clientUserId)) return;

    await this.notifications.dispatch({
      event: NotificationEvent.SUPPORT_REPLY,
      userIds: [conversation.clientUserId],
      context: {
        conversationId: conversation.id,
        conversationCode: conversation.code,
        subject: conversation.subject,
        preview: truncate(body, 140),
        staffName: conversation.assignee?.name ?? 'GKS EDU зөвлөх',
      },
    });
  }

  /**
   * Slack, for the two moments the office genuinely needs to look up: a new
   * thread, and a client writing in while nobody is connected. A second line
   * in a conversation somebody is already holding is not news.
   */
  private async pingOffice(
    conversation: ConversationDetailRow,
    body: string,
    isNew: boolean,
  ): Promise<void> {
    if (!isNew && this.events.staffOnline) return;

    await this.slack.notify({
      emoji: isNew ? '💬' : '📨',
      title: isNew ? 'Шинэ чат нээгдлээ' : 'Чатад шинэ мессеж',
      fields: [
        { label: 'Дугаар', value: conversation.code },
        {
          label: 'Хэрэглэгч',
          value: conversation.clientUser.name ?? conversation.clientUser.email ?? '—',
        },
        { label: 'Харилцагчийн код', value: conversation.clientUser.client?.code },
        { label: 'Сэдэв', value: conversation.subject },
        { label: 'Мессеж', value: truncate(body, 300) },
        { label: 'Хариуцагч', value: conversation.assignee?.name ?? 'Хараахан хуваарилагдаагүй' },
      ],
      link: { label: 'Чат нээх', path: `/admin/messages?conversation=${conversation.id}` },
    });
  }

  // ── Row → payload ─────────────────────────────────────────────────────────

  private toMessage(row: MessageRow) {
    return {
      id: row.id,
      conversationId: row.conversationId,
      kind: row.kind,
      body: row.body,
      fromStaff: row.fromStaff,
      sender: row.sender ? { id: row.sender.id, name: row.sender.name, role: row.sender.role } : null,
      clientToken: row.clientToken,
      editedAt: row.editedAt,
      createdAt: row.createdAt,
    };
  }

  private toListItem(row: ConversationRow, staffView: boolean) {
    return {
      id: row.id,
      code: row.code,
      subject: row.subject,
      topic: row.topic,
      status: row.status,
      caseId: row.caseId,
      caseCode: row.case?.code ?? null,
      assignee: row.assignee,
      lastMessageAt: row.lastMessageAt,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageFromStaff: row.lastMessageFromStaff,
      unread: staffView ? row.staffUnread : row.clientUnread,
      createdAt: row.createdAt,
    };
  }

  private toDetail(row: ConversationDetailRow, staffView: boolean) {
    return {
      ...this.toListItem(row, staffView),
      client: {
        id: row.clientUser.id,
        name: row.clientUser.name,
        role: row.clientUser.role,
        clientCode: row.clientUser.client?.code ?? null,
        // A client reading their own thread has no use for their own contact
        // details, and the CRM's are the ones staff act on.
        email: staffView ? row.clientUser.email : null,
        phone: staffView ? row.clientUser.phone : null,
      },
      firstResponseAt: row.firstResponseAt,
      resolvedAt: row.resolvedAt,
    };
  }
}

/** `Б.Наран` if we know the name, a neutral noun if we do not. */
function staffLabel(name: string | null | undefined): string {
  return name?.trim() || 'Ажилтан';
}

function preview(body: string): string {
  return truncate(body.replace(/\s+/gu, ' ').trim(), PREVIEW_LENGTH);
}

/**
 * Cuts at the last word boundary rather than mid-syllable — this text is a
 * thread's title and the line under it in a list, both of which people read.
 * A word longer than the tail we are willing to drop is cut anyway.
 */
function truncate(value: string, length: number): string {
  const flat = value.replace(/\s+/gu, ' ').trim();
  if (flat.length <= length) return flat;

  const head = flat.slice(0, length - 1);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace > length * 0.6 ? head.slice(0, lastSpace) : head;
  return `${cut.replace(/[\s,.;:—-]+$/u, '')}…`;
}

/** Exported for the controller's Swagger enum and for tests. */
export { Role };
