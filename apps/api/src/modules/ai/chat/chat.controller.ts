import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator.js';
import { ChatChannel } from '../../../prisma/client.js';
import { AccessLevelService } from '../access-level.js';
import { AiConfigService } from '../ai-config.service.js';
import { ChatSessionService } from './chat-session.service.js';
import { OptionalUserService } from './optional-user.service.js';
import { SendChatMessageDto, StartChatSessionDto } from './dto/chat.dto.js';
import { TurnOrchestrator, type TurnEvent } from './turn.orchestrator.js';

/** nginx closes an idle upstream at `proxy_read_timeout`; a comment keeps it awake. */
const HEARTBEAT_MS = 25_000;

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

  @Post('sessions')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 600_000 } })
  @ApiOperation({ summary: 'Start a conversation and get its token and greeting' })
  async start(@Body() dto: StartChatSessionDto, @Req() request: Request) {
    const user = await this.optionalUser.resolve(request);
    const level = await this.accessLevel.resolve(user);
    const config = await this.aiConfig.get();

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
      messages: await this.sessions.transcript(session.id),
    };
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
}

/** One SSE frame. Named events, so the client can switch on `event:`. */
function write(response: Response, event: TurnEvent): void {
  response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
