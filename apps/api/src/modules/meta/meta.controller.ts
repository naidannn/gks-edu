import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { TrackEventDto } from './dto/track-event.dto.js';
import { MetaEventsService } from './meta-events.service.js';
import { metaRequestContext } from './request-context.js';

@ApiTags('meta')
@Controller('meta')
export class MetaController {
  constructor(private readonly meta: MetaEventsService) {}

  /**
   * The browser's own events, relayed through our origin (1A-38).
   *
   * A third of visitors run something that blocks `connect.facebook.net`, and
   * for them the pixel never loads: no PageView, no ViewContent, no Lead, and
   * an ad campaign optimising on a funnel with a hole in it. This endpoint is
   * on gksedu.mn, so it is not blocked, and it carries the same `event_id` the
   * pixel would have used — a visitor whose pixel *did* load sends both, and
   * Meta deduplicates them into one.
   *
   * It is public, which means anyone can post to it. Three things keep that
   * from mattering: the event name must be one of Meta's standard events, the
   * custom data is a closed list of fields, and the rate limit is per address.
   * Nothing here writes to our database.
   */
  @Post('events')
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  // Page views are the bulk of this, and a person browsing quickly can fire a
  // dozen a minute; 60 leaves room for that and none for a flood.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Relay one browser event to the Conversions API' })
  async track(@Body() dto: TrackEventDto, @Req() request: Request): Promise<{ ok: true }> {
    await this.meta.track({
      eventName: dto.eventName,
      eventId: dto.eventId,
      actionSource: 'website',
      eventSourceUrl: dto.eventSourceUrl,
      identity: {
        fbp: dto.fbp,
        fbc: dto.fbc,
        externalIds: [dto.externalId],
        ...metaRequestContext(request),
      },
      customData: dto.customData ? { ...dto.customData } : undefined,
    });

    return { ok: true };
  }
}
