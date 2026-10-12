import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ChatChannel,
  ChatRole,
  ChatSessionStatus,
  FeedbackValue,
  Prisma,
} from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatSessionService } from '../chat/chat-session.service.js';
import type {
  AiPeopleKind,
  AiSessionChannelFilter,
  AiSessionScope,
  QueryAiPeopleDto,
  QueryAiSessionsDto,
} from './dto/admin-chat-sessions.dto.js';

/**
 * A conversation counts as going on while its last message is this recent. Ten
 * minutes, because a visitor reading a long answer and typing the next question
 * on a phone takes a few — and "live" exists so a consultant can step in while
 * the person is still there, not to time a stopwatch.
 */
export const LIVE_WINDOW_MS = 10 * 60 * 1000;

const PAGE_SIZE = 50;

/** The channels a filter value means. */
function channelsFor(filter: AiSessionChannelFilter | undefined): ChatChannel[] {
  switch (filter ?? 'WEB') {
    case 'WEB':
      return [ChatChannel.WEB_WIDGET, ChatChannel.PORTAL];
    case 'WEB_WIDGET':
      return [ChatChannel.WEB_WIDGET];
    case 'PORTAL':
      return [ChatChannel.PORTAL];
    case 'FACEBOOK':
      return [ChatChannel.FACEBOOK];
    case 'ALL':
      return [ChatChannel.WEB_WIDGET, ChatChannel.PORTAL, ChatChannel.FACEBOOK];
  }
}

function scopeWhere(scope: AiSessionScope, now: Date): Prisma.ChatSessionWhereInput {
  switch (scope) {
    case 'ALL':
      return {};
    case 'LIVE':
      return {
        status: ChatSessionStatus.ACTIVE,
        lastMessageAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) },
      };
    case 'USERS':
      return { userId: { not: null } };
    case 'GUESTS':
      return { userId: null };
    case 'LEADS':
      return { leadId: { not: null } };
    case 'DISLIKED':
      return { messages: { some: { feedback: { value: FeedbackValue.DOWN } } } };
  }
}

function searchWhere(q: string | undefined): Prisma.ChatSessionWhereInput {
  const term = q?.trim();
  if (!term) return {};

  const contains = { contains: term, mode: Prisma.QueryMode.insensitive };
  return {
    OR: [
      { code: contains },
      { user: { OR: [{ name: contains }, { email: contains }, { phone: contains }] } },
      { lead: { OR: [{ firstName: contains }, { lastName: contains }, { phone: contains }] } },
      { messages: { some: { content: contains } } },
    ],
  };
}

/** The opening question, on one line — how a conversation is recognised in a list. */
function titleOf(content: string | undefined): string {
  const line = (content ?? '').replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}

/** USD × 1e6 as dollars, rounded to the cent's hundredth — enough to compare. */
function usd(micros: bigint | null | undefined): number {
  return Math.round(Number(micros ?? 0n) / 100) / 10_000;
}

const LIST_SELECT = {
  id: true,
  code: true,
  channel: true,
  status: true,
  outcome: true,
  accessLevel: true,
  anonymousId: true,
  messageCount: true,
  costMicros: true,
  landingPage: true,
  utm: true,
  lastMessageAt: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true, phone: true, client: { select: { id: true, code: true } } },
  },
  lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
  messages: {
    where: { role: ChatRole.USER },
    orderBy: { createdAt: 'asc' },
    take: 1,
    select: { content: true },
  },
} satisfies Prisma.ChatSessionSelect;

type ListRow = Prisma.ChatSessionGetPayload<{ select: typeof LIST_SELECT }>;

/**
 * The office's view of the assistant's conversations (2E-04).
 *
 * Read-only. The assistant's own tables are the record; this only arranges them
 * the way a consultant asks about them — what is happening right now, who has
 * been talking to it, which answers people disliked, which conversations turned
 * into an enquiry. A session nobody wrote in is a widget that was opened and
 * left; it is never listed.
 */
@Injectable()
export class AdminChatSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: ChatSessionService,
  ) {}

  async list(query: QueryAiSessionsDto) {
    const now = new Date();
    const page = query.page ?? 1;
    const limit = query.limit ?? PAGE_SIZE;

    // Everything but the tab: the counts on the tabs are counted under it.
    const base: Prisma.ChatSessionWhereInput = {
      channel: { in: channelsFor(query.channel) },
      messageCount: { gt: 0 },
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.anonymousId ? { anonymousId: query.anonymousId } : {}),
    };
    const search = searchWhere(query.q);
    const where: Prisma.ChatSessionWhereInput = {
      AND: [base, search, scopeWhere(query.scope ?? 'ALL', now)],
    };

    // Read-only, so one round trip in parallel rather than a transaction
    // (CLAUDE.md rule 9).
    const countFor = (scope: AiSessionScope) =>
      this.prisma.chatSession.count({ where: { AND: [base, search, scopeWhere(scope, now)] } });

    const [rows, total, all, live, users, guests, leads, disliked] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
      this.prisma.chatSession.count({ where }),
      countFor('ALL'),
      countFor('LIVE'),
      countFor('USERS'),
      countFor('GUESTS'),
      countFor('LEADS'),
      countFor('DISLIKED'),
    ]);

    const feedback = await this.feedbackBySession(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toItem(row, now, feedback.get(row.id))),
      meta: { total, page, limit },
      counts: { all, live, users, guests, leads, disliked },
    };
  }

  /** One conversation in full — every message, the tools it ran, what each turn cost. */
  async detail(id: string) {
    const now = new Date();
    const session = await this.prisma.chatSession.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        profile: true,
        intents: true,
        summary: true,
        promptTokens: true,
        completionTokens: true,
        case: { select: { id: true, code: true } },
        conversationId: true,
      },
    });
    if (!session) throw new NotFoundException('Чатын сесс олдсонгүй');

    // The same person's other conversations: by account when there is one,
    // otherwise by the browser that started this one.
    const owner: Prisma.ChatSessionWhereInput | null = session.user
      ? { userId: session.user.id }
      : session.anonymousId
        ? { anonymousId: session.anonymousId, userId: null }
        : null;

    const [messages, feedback, siblings] = await Promise.all([
      this.sessions.transcript(id),
      this.feedbackBySession([id]),
      owner
        ? this.prisma.chatSession.findMany({
            where: { ...owner, id: { not: id }, messageCount: { gt: 0 } },
            orderBy: { lastMessageAt: 'desc' },
            take: 20,
            select: LIST_SELECT,
          })
        : Promise.resolve([] as ListRow[]),
    ]);

    return {
      ...this.toItem(session, now, feedback.get(id)),
      profile: session.profile,
      intents: session.intents,
      summary: session.summary,
      promptTokens: session.promptTokens,
      completionTokens: session.completionTokens,
      case: session.case,
      conversationId: session.conversationId,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        citations: Array.isArray(message.citations) ? message.citations : [],
        cards: Array.isArray(message.cards) ? message.cards : [],
        toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
        model: message.model,
        grounded: message.grounded,
        promptTokens: message.promptTokens,
        completionTokens: message.completionTokens,
        latencyMs: message.latencyMs,
        createdAt: message.createdAt,
        feedback: message.feedback,
      })),
      others: siblings.map((row) => this.toItem(row, now, undefined)),
    };
  }

  /**
   * Who has been talking to the assistant — one row per person rather than per
   * conversation. Signed-in people by account; guests by the browser id the
   * widget keeps, which is as close to "one visitor" as an anonymous chat gets.
   */
  async people(query: QueryAiPeopleDto) {
    const kind: AiPeopleKind = query.kind ?? 'USERS';
    const page = query.page ?? 1;
    const limit = query.limit ?? PAGE_SIZE;
    const term = query.q?.trim();
    const contains = term ? { contains: term, mode: Prisma.QueryMode.insensitive } : null;

    const base: Prisma.ChatSessionWhereInput = {
      channel: { in: channelsFor(query.channel) },
      messageCount: { gt: 0 },
    };

    if (kind === 'GUESTS') {
      const where: Prisma.ChatSessionWhereInput = {
        ...base,
        userId: null,
        anonymousId: { not: null },
        ...(contains ? { messages: { some: { content: contains } } } : {}),
      };
      const [groups, everyone] = await Promise.all([
        this.prisma.chatSession.groupBy({
          by: ['anonymousId'],
          where,
          _count: { _all: true },
          _sum: { messageCount: true },
          _max: { lastMessageAt: true },
          _min: { createdAt: true },
          orderBy: { _max: { lastMessageAt: 'desc' } },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.chatSession.groupBy({ by: ['anonymousId'], where }),
      ]);

      return {
        items: groups.map((group) => ({
          kind: 'GUEST' as const,
          anonymousId: group.anonymousId,
          user: null,
          sessions: group._count._all,
          messages: group._sum.messageCount ?? 0,
          firstChatAt: group._min.createdAt,
          lastChatAt: group._max.lastMessageAt,
        })),
        meta: { total: everyone.length, page, limit },
      };
    }

    const where: Prisma.ChatSessionWhereInput = {
      ...base,
      userId: { not: null },
      ...(contains ? { user: { OR: [{ name: contains }, { email: contains }, { phone: contains }] } } : {}),
    };
    const [groups, everyone] = await Promise.all([
      this.prisma.chatSession.groupBy({
        by: ['userId'],
        where,
        _count: { _all: true },
        _sum: { messageCount: true },
        _max: { lastMessageAt: true },
        _min: { createdAt: true },
        orderBy: { _max: { lastMessageAt: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatSession.groupBy({ by: ['userId'], where }),
    ]);

    const ids = groups.map((group) => group.userId).filter((id): id is string => Boolean(id));
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            client: { select: { id: true, code: true } },
          },
        })
      : [];
    const byId = new Map(users.map((user) => [user.id, user]));

    return {
      items: groups.map((group) => ({
        kind: 'USER' as const,
        anonymousId: null,
        user: group.userId ? (byId.get(group.userId) ?? null) : null,
        sessions: group._count._all,
        messages: group._sum.messageCount ?? 0,
        firstChatAt: group._min.createdAt,
        lastChatAt: group._max.lastMessageAt,
      })),
      meta: { total: everyone.length, page, limit },
    };
  }

  /** 👍 and 👎 per conversation, for the rows on one page. */
  private async feedbackBySession(ids: string[]): Promise<Map<string, { up: number; down: number }>> {
    const tally = new Map<string, { up: number; down: number }>();
    if (!ids.length) return tally;

    const rows = await this.prisma.chatFeedback.findMany({
      where: { message: { sessionId: { in: ids } } },
      select: { value: true, message: { select: { sessionId: true } } },
    });

    for (const row of rows) {
      const entry = tally.get(row.message.sessionId) ?? { up: 0, down: 0 };
      if (row.value === FeedbackValue.UP) entry.up += 1;
      else entry.down += 1;
      tally.set(row.message.sessionId, entry);
    }
    return tally;
  }

  private toItem(row: ListRow, now: Date, feedback: { up: number; down: number } | undefined) {
    const utm = (row.utm ?? null) as Record<string, unknown> | null;

    return {
      id: row.id,
      code: row.code,
      channel: row.channel,
      status: row.status,
      outcome: row.outcome,
      accessLevel: row.accessLevel,
      anonymousId: row.anonymousId,
      title: titleOf(row.messages[0]?.content),
      // `messageCount` counts both sides; the visitor's half is what people mean by "asked".
      questions: Math.ceil(row.messageCount / 2),
      messageCount: row.messageCount,
      costUsd: usd(row.costMicros),
      landingPage: row.landingPage,
      source: typeof utm?.utmSource === 'string' ? utm.utmSource : null,
      live:
        row.status === ChatSessionStatus.ACTIVE && now.getTime() - row.lastMessageAt.getTime() < LIVE_WINDOW_MS,
      lastMessageAt: row.lastMessageAt,
      createdAt: row.createdAt,
      user: row.user,
      lead: row.lead,
      feedback: feedback ?? { up: 0, down: 0 },
    };
  }
}
