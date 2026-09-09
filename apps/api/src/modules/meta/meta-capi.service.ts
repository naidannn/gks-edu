import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MetaServerEvent } from './meta-capi.types.js';
import { matchSignalCount } from './meta-user-data.js';

/**
 * The Conversions API transport (1A-38) — the one place that talks to Meta.
 *
 * It is deliberately thin: the events it is handed are already hashed and
 * already in the Graph API's shape, because the work of turning a domain fact
 * into an event happens in {@link MetaEventsService}, before the queue. All
 * this owns is the HTTP call and what to do when it fails.
 *
 * With `META_PIXEL_ID` or `META_CAPI_ACCESS_TOKEN` unset the service logs
 * instead of posting, so nothing is written to the real dataset from a
 * developer's machine — the same arrangement as `SlackService` and
 * `EmailService`.
 */
@Injectable()
export class MetaCapiService {
  private readonly logger = new Logger(MetaCapiService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.pixelId && this.accessToken && !this.config.get<boolean>('meta.mock'));
  }

  /** The dataset id, which the browser pixel carries too — public by design. */
  get pixelId(): string {
    return this.config.get<string>('meta.pixelId') ?? '';
  }

  private get accessToken(): string {
    return this.config.get<string>('meta.accessToken') ?? '';
  }

  /**
   * Sends a batch. Throws on anything that is worth trying again, so the
   * BullMQ processor above it can retry; a request Meta rejected outright is
   * reported as {@link MetaPermanentError} instead, because retrying a
   * malformed event just burns the queue.
   *
   * Meta accepts up to 1000 events per call, but the funnel's volume never
   * approaches that — batching exists here so the caller *may* group, not
   * because it must.
   */
  async send(events: MetaServerEvent[]): Promise<{ eventsReceived: number }> {
    if (!events.length) return { eventsReceived: 0 };

    if (!this.enabled) {
      for (const event of events) {
        this.logger.debug(
          `[mock] Meta CAPI ${event.event_name} (${event.event_id}) — ${matchSignalCount(event.user_data)} тааруулах дохио`,
        );
      }
      return { eventsReceived: 0 };
    }

    const version = this.config.get<string>('meta.graphVersion') ?? 'v26.0';
    const testEventCode = this.config.get<string>('meta.testEventCode');

    const response = await fetch(`https://graph.facebook.com/${version}/${this.pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The token goes in the body rather than the query string: a URL ends up
      // in access logs and error messages, and this one is a long-lived
      // system-user credential.
      body: JSON.stringify({
        data: events,
        access_token: this.accessToken,
        ...(testEventCode ? { test_event_code: testEventCode } : {}),
      }),
      signal: AbortSignal.timeout(this.config.get<number>('meta.timeoutMs') ?? 10_000),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      events_received?: number;
      messages?: string[];
      error?: { message?: string; code?: number; error_subcode?: number; is_transient?: boolean };
    };

    if (!response.ok || payload.error) {
      const error = payload.error;
      const detail = error?.message ?? `HTTP ${response.status}`;

      // 4xx that is not rate limiting or an explicitly transient failure means
      // the event itself is wrong (bad field, revoked token). No number of
      // retries fixes that, and a poison job would keep the whole queue busy.
      const retryable =
        response.status >= 500 || response.status === 429 || error?.is_transient === true || error?.code === 2;

      const message = `Meta CAPI ${events.map((event) => event.event_name).join(', ')} илгээгдсэнгүй: ${detail}`;
      if (retryable) throw new Error(message);
      throw new MetaPermanentError(message);
    }

    if (payload.messages?.length) {
      // Meta answers 200 with warnings for things it accepted but disliked —
      // a deprecated field, a value it could not parse. Worth seeing.
      this.logger.warn(`Meta CAPI сэрэмжлүүлэг: ${payload.messages.join('; ')}`);
    }

    return { eventsReceived: payload.events_received ?? events.length };
  }
}

/** A rejection no retry can fix — the processor turns this into a dead job, not a backoff. */
export class MetaPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetaPermanentError';
  }
}
