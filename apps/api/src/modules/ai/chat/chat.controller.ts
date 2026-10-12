import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ChatChannel, type ChatSession } from '../../../prisma/client.js';
import { AccessLevelService } from '../access-level.js';
import { AiConfigService } from '../ai-config.service.js';
import { ChatSessionService } from './chat-session.service.js';
import { OptionalUserService } from './optional-user.service.js';
import {
  ChatFeedbackDto,
  ChatHistoryDto,
  SendChatMessageDto,
  StartChatSessionDto,
} from './dto/chat.dto.js';
import { TurnOrchestrator, type TurnEvent } from './turn.orchestrator.js';

/** nginx closes an idle upstream at `proxy_read_timeout`; a comment keeps it awake. */
const HEARTBEAT_MS = 25_000;

/**
 * Frames only the web endpoint sends — the guest allowance (2C-15). Not part of
 * `TurnEvent`, because the orchestrator also answers Facebook, where nobody
 * signs in.
 *
 * `quota` follows every guest turn with what is left; `error` with code
 * `auth_required` replaces a turn the allowance does not cover, and the widget
 * answers it with the sign-up card rather than an apology.
 */
type ChatFrame = TurnEvent | { type: 'quota'; remaining: number; limit: number };

const AUTH_REQUIRED = 'auth_required';

/**
 * The chat endpoints (2B-09, AI-ASSISTANT.md §12.1).
 *
 * Public, because a visitor asking "how much does it cost" has no account and
 * should not need one — and rate-limited hard for the same reason. A signed-in
 * caller is still recognised (`OptionalUserService`), which is what raises the
 * answer from general advice to their own case.
 *
 * The answer is streamed from a POST, so it is written to the response by hand
 * rather than through Nest's `@Sse()` — that decorator registers a GET, and the
 * question does not belong in a URL. The browser reads it with `fetch` and a
 * reader, the same way the messenger does (1K), because `EventSource` cannot
 * carry an Authorization header.
 */
@ApiTags('ai-chat')
@Controller('ai/chat')
export class ChatController {
  constructor(
    private readonly sessions: ChatSessionService,
    private readonly orchestrator: TurnOrchestrator,
    private readonly accessLevel: AccessLevelService,
    private readonly aiConfig: AiConfigService,
    private readonly optionalUser: OptionalUserService,
  ) {}

  /**
   * Whether there is an assistant to talk to (2C-02).
   *
   * The widget asks this before it draws anything. Without it the only way to
   * learn the switch is off is to try to start a conversation and be refused,
   * which means a launcher button that appears, is pressed, and apologises —
   * worse than no button. One indexed-free read, behind the config service's
   * own 30-second memo, so a page view costs nothing.
   */
  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Whether the assistant is switched on' })
  async status(@Query('anonymousId') anonymousId: string | undefined, @Req() request: Request) {
    const config = await this.aiConfig.get();
    const base = { enabled: config.enabled, greeting: config.enabled ? config.greeting : null };

    // The guest allowance, so the composer can say "1 асуулт үлдлээ" before the
    // visitor types rather than after. Somebody signed in has none to count.
    const user = await this.optionalUser.resolve(request);
    if (user || !config.enabled) return { ...base, guest: null };

    const asked = await this.sessions.guestAnswersReceived(cleanAnonymousId(anonymousId));
    return {
      ...base,
      guest: { limit: config.guestMessageLimit, remaining: Math.max(config.guestMessageLimit - asked, 0) },
    };
  }

  @Post('sessions')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Start a conversation and get its token and greeting' })
  async start(@Body() dto: StartChatSessionDto, @Req() request: Request) {
    // The kill switch is checked before a row is written, not only before an
    // answer is generated. `enabled` is false until the office turns the
    // assistant on, and while it is false the endpoint has to be inert rather
    // than merely quiet: a session minted here is a `ChatSession` row, a code
    // out of the same counter the real conversations will use, and a token
    // handed to an anonymous caller. Nothing renders a chat yet (2C-02 is
    // still todo), so the only thing that can reach this endpoint while the
    // switch is off is something we did not build.
    const config = await this.aiConfig.get();
    if (!config.enabled) {
      throw new ServiceUnavailableException('AI туслах одоогоор идэвхгүй байна.');
    }

    const user = await this.optionalUser.resolve(request);
    const level = await this.accessLevel.resolve(user);

    const { session, token } = await this.sessions.start({
      channel: dto.channel ?? ChatChannel.WEB_WIDGET,
      userId: user?.id ?? null,
      anonymousId: dto.anonymousId ?? ChatSessionService.newAnonymousId(),
      accessLevel: level,
      caseId: dto.caseId ?? null,
      ...(dto.utm ? { utm: dto.utm as never } : {}),
      landingPage: dto.landingPage ?? null,
    });

    return {
      sessionId: session.id,
      code: session.code,
      token,
      greeting: config.greeting,
      enabled: config.enabled,
    };
  }

  /**
   * The caller's past conversations, newest first — the `/chat` sidebar (2C-13).
   *
   * A POST because a guest's proof is a list of tokens, and tokens do not
   * belong in a URL any more than the questions do. Not gated on the kill
   * switch: switching the assistant off stops new answers, it does not make
   * somebody's earlier conversation unreadable.
   */
  @Post('history')
  @Public()
  @Throttle({ default: { limit: 60, ttl: 600_000 } })
  @ApiOperation({ summary: 'List the caller’s conversations' })
  async listHistory(@Body() dto: ChatHistoryDto, @Req() request: Request) {
    const user = await this.optionalUser.resolve(request);

    return this.sessions.listSummaries({ tokens: dto.tokens ?? [], userId: user?.id ?? null });
  }

  @Get('sessions/:id')
  @Public()
  @ApiOperation({ summary: 'The transcript so far — for a reload mid-conversation' })
  async history(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    const user = await this.optionalUser.resolve(request);
    const session = await this.sessions.authorise({
      sessionId: id,
      token: OptionalUserService.chatToken(request),
      userId: user?.id ?? null,
    });

    return {
      sessionId: session.id,
      status: session.status,
      messages: await this.sessions.publicTranscript(session.id),
    };
  }

  /**
   * 👍/👎 on one answer (2C-11).
   *
   * Authorised through the session, not the message: the caller proves they own
   * the conversation, and `recordFeedback` then checks the message is in it. A
   * message id alone must not be enough to vote, or the signal the office reads
   * to find its worst answers becomes something anyone can write.
   */
  @Post('sessions/:id/messages/:messageId/feedback')
  @Public()
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  @ApiOperation({ summary: 'Rate one answer' })
  async feedback(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Body() dto: ChatFeedbackDto,
    @Req() request: Request,
  ) {
    const user = await this.optionalUser.resolve(request);
    const session = await this.sessions.authorise({
      sessionId: id,
      token: OptionalUserService.chatToken(request),
      userId: user?.id ?? null,
    });

    return this.sessions.recordFeedback({
      sessionId: session.id,
      messageId,
      value: dto.value,
      reason: dto.reason ?? null,
      comment: dto.comment ?? null,
    });
  }

  /**
   * One turn, streamed.
   *
   * 20 messages per ten minutes: a real conversation is a dozen turns, and
   * anything past that is a script. The limiter is per IP — the session token is
   * free to mint, so limiting on it would be limiting on nothing.
   */
  @Post('sessions/:id/messages')
  @Public()
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @ApiOperation({ summary: 'Ask a question and stream the answer (SSE)' })
  async send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendChatMessageDto,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const user = await this.optionalUser.resolve(request);
    const session = await this.sessions.authorise({
      sessionId: id,
      token: OptionalUserService.chatToken(request),
      userId: user?.id ?? null,
    });

    // Re-resolved per turn, never read from the session row: a contract signed
    // mid-conversation changes what may be retrieved (AI-ASSISTANT.md §4.5).
    const level = await this.accessLevel.resolve(user);

    // The guest allowance (2C-15). Decided here rather than in the browser,
    // which only mirrors it: a widget is a suggestion, this is the rule. The
    // question is not stored — the widget keeps it and sends it again once the
    // visitor has an account, so it is asked once, by somebody we know.
    const guest = user ? null : await this.guestAllowance(session);

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Without this nginx buffers the stream and the "live" answer lands in one lump.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const controller = new AbortController();
    // A visitor who closes the tab should stop the upstream model call too —
    // otherwise the tokens are spent on an answer nobody will read.
    request.on('close', () => controller.abort());

    if (guest && guest.remaining <= 0) {
      write(response, {
        type: 'error',
        code: AUTH_REQUIRED,
        message: 'Үргэлжлүүлэхийн тулд бүртгүүлнэ үү — асуултад тань шууд хариулна.',
        fallback: 'consultation',
      });
      response.end();
      return;
    }

    const heartbeat = setInterval(() => response.write(': ping\n\n'), HEARTBEAT_MS);

    try {
      for await (const event of this.orchestrator.run({
        session,
        level,
        message: dto.message,
        signal: controller.signal,
      })) {
        write(response, event);
      }

      if (guest) {
        const asked = await this.sessions.guestAnswersReceived(session.anonymousId);
        write(response, { type: 'quota', limit: guest.limit, remaining: Math.max(guest.limit - asked, 0) });
      }
    } catch (error) {
      write(response, {
        type: 'error',
        code: 'turn_failed',
        message: error instanceof Error ? error.message : 'Хариулт үүсгэхэд алдаа гарлаа',
        fallback: 'messenger',
      });
    } finally {
      clearInterval(heartbeat);
      response.end();
    }
  }

  @Post('sessions/:id/close')
  @Public()
  @ApiOperation({ summary: 'End a conversation' })
  async close(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    const user = await this.optionalUser.resolve(request);
    const session = await this.sessions.authorise({
      sessionId: id,
      token: OptionalUserService.chatToken(request),
      userId: user?.id ?? null,
    });

    await this.sessions.close(session.id);
    return { closed: true };
  }

  /**
   * What a signed-out caller has left, or `null` when the allowance does not
   * apply. Only the public widget is metered: the cabinet's widget has a
   * signed-in user by construction, and a session with no browser id predates
   * the allowance and is left alone rather than locked.
   */
  private async guestAllowance(session: ChatSession): Promise<{ limit: number; remaining: number } | null> {
    if (session.channel !== ChatChannel.WEB_WIDGET || !session.anonymousId) return null;

    const config = await this.aiConfig.get();
    const asked = await this.sessions.guestAnswersReceived(session.anonymousId);
    return { limit: config.guestMessageLimit, remaining: config.guestMessageLimit - asked };
  }
}

/** The widget's browser id is 32 hex characters; anything else counts nothing. */
function cleanAnonymousId(value: string | undefined): string | null {
  return value && /^[a-f0-9]{16,64}$/i.test(value) ? value : null;
}

/** One SSE frame. Named events, so the client can switch on `event:`. */
function write(response: Response, event: ChatFrame): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
