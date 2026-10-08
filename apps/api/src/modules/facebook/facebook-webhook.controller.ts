import { InjectQueue } from '@nestjs/bullmq';
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Queue } from 'bullmq';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { FACEBOOK_INBOUND_JOB, FACEBOOK_INBOUND_QUEUE } from '../../queue/queue.constants.js';
import { verifySignature } from './facebook-rules.js';
import type { FacebookInboundJob } from './facebook.types.js';
import type { PageWebhookBody } from './facebook-webhook.js';

/**
 * The Page webhook (2F): `GET` is Meta's subscription handshake, `POST` is
 * every message, echo and comment.
 *
 * Public and unthrottled, because the caller is Meta — from many addresses, in
 * bursts — and the throttler's per-IP bucket would start refusing real messages
 * the first busy evening. What keeps it closed instead is the signature: every
 * POST is an HMAC of its bytes under the app secret, and anything that does not
 * verify is refused before it is read.
 *
 * The handler only verifies and enqueues. Meta waits at most twenty seconds,
 * retries what it did not see acknowledged and eventually unsubscribes an
 * endpoint that keeps failing; storing, profile lookups and the assistant all
 * happen in the queue, behind a 200 that has already gone back.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('facebook/webhook')
export class FacebookWebhookController {
  private readonly logger = new Logger(FacebookWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(FACEBOOK_INBOUND_QUEUE) private readonly inbound: Queue,
  ) {}

  @Get()
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get<string>('facebook.verifyToken') ?? '';
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge) {
      throw new ForbiddenException('Webhook баталгаажуулалт амжилтгүй');
    }
    return challenge;
  }

  @Post()
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest<Request>): Promise<'EVENT_RECEIVED'> {
    const secret = this.config.get<string>('facebook.appSecret') ?? '';
    const production = this.config.get<string>('nodeEnv') === 'production';

    if (secret) {
      if (!request.rawBody || !verifySignature(request.rawBody, request.header('x-hub-signature-256'), secret)) {
        throw new ForbiddenException('Гарын үсэг таарсангүй');
      }
    } else if (production) {
      // Without the secret there is no way to tell Meta from anybody else who
      // found the URL, and an unsigned "message" would reach the assistant.
      this.logger.error('FB_APP_SECRET тохируулаагүй тул Facebook webhook-ийг хүлээж авсангүй');
      throw new ForbiddenException('Webhook тохируулагдаагүй');
    }

    const body = request.body as PageWebhookBody;
    if (body.object !== 'page') return 'EVENT_RECEIVED';

    for (const entry of body.entry ?? []) {
      await this.inbound.add(FACEBOOK_INBOUND_JOB, { entry } satisfies FacebookInboundJob, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: 500,
      });
    }

    return 'EVENT_RECEIVED';
  }
}
