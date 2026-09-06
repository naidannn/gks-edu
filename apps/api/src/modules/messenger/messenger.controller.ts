import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, Subject, finalize, interval, map, merge } from 'rxjs';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { QueryMessagesDto, SendMessageDto, SetTypingDto } from './dto/messenger.dto.js';
import { MessengerEventsService } from './messenger-events.service.js';
import { MessengerService } from './messenger.service.js';
import type { MessengerStreamEvent } from './messenger.types.js';

/**
 * A thread is one resource whichever side is looking at it, so the operations
 * that act on a thread live here rather than being written twice under `me/`
 * and `admin/`. `MessengerService.load()` is the access check: a client
 * reaches their own threads, staff reach all of them.
 *
 * The listing endpoints do differ per side — a client has a short list, staff
 * have a queue with filters and counts — and those stay in the two
 * role-specific controllers.
 */
@ApiTags('messenger')
@ApiBearerAuth()
@Controller('messenger')
export class MessengerController {
  constructor(
    private readonly messenger: MessengerService,
    private readonly events: MessengerEventsService,
  ) {}

  @Get('unread')
  @ApiOperation({ summary: 'Уншаагүй чатын тоо (навигацийн тэмдэглэгээ)' })
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.messenger.unreadSummary(user);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Чатын мессежүүд — шинэ нь сүүлд, хуучин руугаа хуудаслана' })
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: QueryMessagesDto,
  ) {
    return this.messenger.messages(user, id, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Мессеж илгээх' })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messenger.send(user, id, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Уншсан болгох' })
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    this.events.markWatching(id, user.id);
    await this.messenger.markRead(user, id);
  }

  @Post('conversations/:id/typing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Бичиж байгааг мэдэгдэх (хадгалагдахгүй)' })
  async typing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTypingDto,
  ): Promise<void> {
    await this.messenger.setTyping(user, id, dto.typing);
  }

  @Post('conversations/:id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Чатыг хаасныг мэдэгдэх — цаашид мэдэгдэл очно' })
  leave(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): void {
    this.messenger.leave(user, id);
  }

  /**
   * The live thread.
   *
   * `EventSource` cannot send an `Authorization` header, so the browser reads
   * this with `fetch` and a stream reader instead (`useMessengerStream`) —
   * which is why the route needs no token-in-query escape hatch and stays
   * behind the same global guard as everything else.
   *
   * `X-Accel-Buffering: no` is for nginx: without it the proxy holds events in
   * its buffer and the "live" thread arrives in bursts.
   */
  @Sse('stream')
  @Header('X-Accel-Buffering', 'no')
  @Header('Cache-Control', 'no-cache, no-transform')
  @ApiOperation({ summary: 'Шууд урсгал (SSE) — шинэ мессеж, уншсан төлөв, бичиж байна' })
  stream(@CurrentUser() user: AuthenticatedUser): Observable<{ data: MessengerStreamEvent }> {
    const id = randomUUID();
    const channel = new Subject<MessengerStreamEvent>();
    this.events.subscribe(id, user.id, isStaff(user.role), channel);

    // nginx closes an idle upstream at `proxy_read_timeout 300`; a comment
    // frame every 25s keeps the connection and any intermediate proxy awake.
    const heartbeat = interval(25_000).pipe(
      map((): MessengerStreamEvent => ({ type: 'ping', conversationId: null })),
    );

    return merge(channel.asObservable(), heartbeat).pipe(
      map((event) => ({ data: event })),
      finalize(() => {
        this.events.unsubscribe(id);
        channel.complete();
      }),
    );
  }
}
