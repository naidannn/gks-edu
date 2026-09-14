import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { nextYearlyCode } from '../../../common/utils/yearly-code.js';
import {
  AccessLevel,
  ChatChannel,
  ChatRole,
  ChatSessionStatus,
  Prisma,
  type ChatSession,
  type FeedbackReason,
  type FeedbackValue,
} from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import type { LlmMessage } from '../llm/llm.types.js';

/** A guest's session token stays valid for a month — long enough that a visitor
 *  who comes back tomorrow keeps their thread, short enough to expire. */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** How many stored messages are replayed to the model; the rest is the summary. */
const HISTORY_TURNS = 12;

export interface StartSessionInput {
  channel: ChatChannel;
  userId?: string | null;
  /** A browser id the widget keeps, so a guest's sessions can be linked later. */
  anonymousId?: string | null;
  accessLevel: AccessLevel;
  caseId?: string | null;
  utm?: Prisma.InputJsonValue;
  landingPage?: string | null;
}

/**
 * Chat sessions: creating them, proving who owns one, and reading back the
 * history a turn needs (2B-03, 2B-04).
 *
 * **Ownership.** A signed-in user owns a session by `userId`. A guest owns one by
 * holding its token — 128 random bits, HMAC-signed with an expiry, verified
 * without a database lookup. The same construction as `StorageService`'s signed
 * download links, and for the same reason: the alternative is a table of secrets
 * to store, expire and leak. The token proves *this session*, nothing else, so a
 * stolen one is worth one conversation rather than an account.
 */
@Injectable()
export class ChatSessionService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // The chat token is not a JWT and must not be verifiable as one; it borrows
    // the refresh secret only as key material.
    this.secret = config.getOrThrow<string>('jwt.refreshSecret');
  }

  async start(input: StartSessionInput): Promise<{ session: ChatSession; token: string }> {
    const session = await this.prisma.chatSession.create({
      data: {
        code: await this.generateCode(),
        channel: input.channel,
        userId: input.userId ?? null,
        anonymousId: input.anonymousId ?? null,
        accessLevel: input.accessLevel,
        caseId: input.caseId ?? null,
        ...(input.utm !== undefined ? { utm: input.utm } : {}),
        landingPage: input.landingPage ?? null,
      },
    });

    return { session, token: this.sign(session.id) };
  }

  /**
   * The session this caller is allowed to act in.
   *
   * A signed-in user reaches their own sessions by id alone; everyone else has
   * to present the token. A session that was started anonymously and is now
   * being used by the person who signed in gets claimed here — that is the
   * "attach the guest session on login" step (§12.1).
   */
  async authorise(params: { sessionId: string; token?: string | null; userId?: string | null }) {
    const session = await this.prisma.chatSession.findUnique({ where: { id: params.sessionId } });
    if (!session) throw new NotFoundException('Чатын сесс олдсонгүй');

    const byUser = Boolean(params.userId) && session.userId === params.userId;
    const byToken = Boolean(params.token) && this.verify(params.token!, session.id);

    if (!byUser && !byToken) throw new ForbiddenException('Энэ чатад хандах эрхгүй байна');

    if (params.userId && !session.userId) {
      return this.prisma.chatSession.update({
        where: { id: session.id },
        data: { userId: params.userId },
      });
    }

    return session;
  }

  /** Messages the model sees: the last few turns, oldest first. */
  async history(sessionId: string, take = HISTORY_TURNS): Promise<LlmMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId, role: { in: [ChatRole.USER, ChatRole.ASSISTANT] } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { role: true, content: true },
    });

    return rows
      .reverse()
      .filter((row) => row.content.trim().length > 0)
      .map((row) => ({
        role: row.role === ChatRole.USER ? ('user' as const) : ('assistant' as const),
        content: row.content,
      }));
  }

  async recordUserMessage(sessionId: string, content: string) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({ data: { sessionId, role: ChatRole.USER, content } }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { messageCount: { increment: 1 }, lastMessageAt: new Date() },
      }),
    ]);

    return message;
  }

  /**
   * Stores the answer and bills the session for it.
   *
   * One transaction, because a stored answer that was never paid for is how a
   * budget quietly stops counting — and the daily ceiling is the only thing
   * standing between a loop and a month's spend.
   */
  async recordAnswer(params: {
    sessionId: string;
    content: string;
    model: string;
    grounded: boolean;
    citations?: Prisma.InputJsonValue;
    cards?: Prisma.InputJsonValue;
    toolCalls?: Prisma.InputJsonValue;
    promptTokens: number;
    completionTokens: number;
    costMicros: number;
    latencyMs: number;
  }) {
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          sessionId: params.sessionId,
          role: ChatRole.ASSISTANT,
          content: params.content,
          model: params.model,
          grounded: params.grounded,
          ...(params.citations !== undefined ? { citations: params.citations } : {}),
          ...(params.cards !== undefined ? { cards: params.cards } : {}),
          ...(params.toolCalls !== undefined ? { toolCalls: params.toolCalls } : {}),
          promptTokens: params.promptTokens,
          completionTokens: params.completionTokens,
          latencyMs: params.latencyMs,
        },
      }),
      this.prisma.chatSession.update({
        where: { id: params.sessionId },
        data: {
          messageCount: { increment: 1 },
          lastMessageAt: new Date(),
          promptTokens: { increment: params.promptTokens },
          completionTokens: { increment: params.completionTokens },
          costMicros: { increment: BigInt(params.costMicros) },
        },
      }),
    ]);

    return message;
  }

  /** The whole transcript, for the admin session viewer (2E-04). */
  async transcript(sessionId: string) {
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        citations: true,
        cards: true,
        toolCalls: true,
        model: true,
        grounded: true,
        promptTokens: true,
        completionTokens: true,
        latencyMs: true,
        createdAt: true,
        feedback: { select: { value: true, reason: true, comment: true } },
      },
    });
  }

  /**
   * The transcript as the widget reads it back after a reload (2C-01).
   *
   * Deliberately not `transcript()`. That one is the admin viewer's, and it
   * carries which model answered, what the turn cost in tokens and how long it
   * took — operational figures that belong to the office, not to the visitor
   * whose question they describe. `toolCalls` is left out for the same reason:
   * the arguments the model chose are a debugging artefact, and they can quote
   * the question back in a form nobody expected to be shown.
   *
   * What does come back is what the conversation looked like: the words, the
   * cards beside them, the citations under them, and whether a thumb has
   * already been given so the buttons render in the right state.
   */
  async publicTranscript(sessionId: string) {
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId, role: { in: [ChatRole.USER, ChatRole.ASSISTANT] } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        citations: true,
        cards: true,
        grounded: true,
        createdAt: true,
        feedback: { select: { value: true, reason: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      sources: Array.isArray(row.citations) ? row.citations : [],
      cards: Array.isArray(row.cards) ? row.cards : [],
      grounded: row.grounded,
      feedback: row.feedback,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Records a thumb on one answer (2C-11).
   *
   * The message has to belong to the session the caller proved they own —
   * otherwise a known message id is enough to vote on somebody else's
   * conversation, and the quality signal the office reads becomes noise anyone
   * can write. An upsert, because changing your mind is not a second opinion.
   */
  async recordFeedback(params: {
    sessionId: string;
    messageId: string;
    value: FeedbackValue;
    reason?: FeedbackReason | null;
    comment?: string | null;
  }) {
    const message = await this.prisma.chatMessage.findFirst({
      where: { id: params.messageId, sessionId: params.sessionId, role: ChatRole.ASSISTANT },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Энэ яриан дотор ийм хариулт алга');

    const data = {
      value: params.value,
      reason: params.reason ?? null,
      comment: params.comment?.trim() || null,
    };

    return this.prisma.chatFeedback.upsert({
      where: { messageId: message.id },
      create: { messageId: message.id, ...data },
      update: data,
      select: { value: true, reason: true },
    });
  }

  async close(sessionId: string): Promise<void> {
    await this.prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: ChatSessionStatus.CLOSED },
    });
  }

  /** Tokens spent across the platform today — the daily ceiling's input (2B-12). */
  async tokensSpentToday(): Promise<number> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);

    const totals = await this.prisma.chatSession.aggregate({
      where: { lastMessageAt: { gte: since } },
      _sum: { promptTokens: true, completionTokens: true },
    });

    return (totals._sum.promptTokens ?? 0) + (totals._sum.completionTokens ?? 0);
  }

  // ─── Guest tokens ───────────────────────────────────────────────────────────

  /** `ai_<sessionId base64url>.<expiry>.<hmac>` — verifiable with no lookup. */
  sign(sessionId: string): string {
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    const payload = `${Buffer.from(sessionId, 'utf8').toString('base64url')}.${expiresAt}`;

    return `ai_${payload}.${this.hmac(payload)}`;
  }

  /** Whether this token was minted by us, for this session, and is still valid. */
  verify(token: string, sessionId: string): boolean {
    if (!token.startsWith('ai_')) return false;

    const [idB64, expiresRaw, signature] = token.slice(3).split('.');
    if (!idB64 || !expiresRaw || !signature) return false;

    const expected = this.hmac(`${idB64}.${expiresRaw}`);
    const given = Buffer.from(signature);
    const want = Buffer.from(expected);
    if (given.length !== want.length || !timingSafeEqual(given, want)) return false;

    if (Number.parseInt(expiresRaw, 10) < Date.now()) return false;

    return Buffer.from(idB64, 'base64url').toString('utf8') === sessionId;
  }

  /** A browser id for a guest who arrives without one. */
  static newAnonymousId(): string {
    return randomBytes(16).toString('hex');
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }

  /** `AI-2026-0042`. */
  private generateCode(): Promise<string> {
    return nextYearlyCode('AI', async (stem) =>
      (
        await this.prisma.chatSession.findFirst({
          where: { code: { startsWith: stem } },
          orderBy: { code: 'desc' },
          select: { code: true },
        })
      )?.code ?? null,
    );
  }
}
