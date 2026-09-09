import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { META_CAPI_JOB, META_CAPI_QUEUE } from '../../queue/queue.constants.js';
import type { MetaServerEvent, MetaTrackInput } from './meta-capi.types.js';
import { buildUserData, matchSignalCount } from './meta-user-data.js';

/**
 * The API every domain module calls (1A-38): "this conversion happened".
 *
 * Two things happen here and nowhere else.
 *
 * **Hashing before the queue.** The identity a caller passes in is raw — an
 * email, a phone number, a name. It is normalised and SHA-256'd on the way
 * *in*, so what sits in Redis waiting to be delivered is already a set of
 * digests. A queue that backs up, a Redis dump taken for debugging, a failed
 * job inspected in a dashboard: none of them expose a client's details.
 *
 * **Never blocking, never throwing.** A conversion is a side effect of a
 * business action, and Facebook being unreachable must not fail a lead, a
 * registration or a payment. Everything is enqueued and every error is
 * swallowed with a log line — the same rule `SlackService` follows.
 */
@Injectable()
export class MetaEventsService {
  private readonly logger = new Logger(MetaEventsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(META_CAPI_QUEUE) private readonly queue: Queue<{ event: MetaServerEvent }>,
  ) {}

  /**
   * Builds the server event and hands it to the queue.
   *
   * The job id is `event_name-event_id`, which makes re-delivery free: the
   * payment webhook and the polling fallback both confirm the same payment
   * within milliseconds of each other, and BullMQ drops the second job rather
   * than sending Meta a duplicate. It is a second line of defence behind the
   * `event_id` deduplication Meta does on its own side.
   *
   * A hyphen, not a colon: BullMQ builds its Redis keys around `:` and rejects
   * a job id containing one.
   */
  async track(input: MetaTrackInput): Promise<void> {
    try {
      const userData = buildUserData(input.identity);

      const event: MetaServerEvent = {
        event_name: input.eventName,
        event_time: Math.floor((input.eventTime ?? new Date()).getTime() / 1000),
        event_id: input.eventId,
        action_source: input.actionSource,
        user_data: userData,
        ...(input.customData ? { custom_data: input.customData } : {}),
      };

      // `event_source_url` is required for anything Meta will attribute to the
      // website, and a server event fired from a webhook has no request to read
      // it off — the public app URL is the honest fallback.
      const sourceUrl = input.eventSourceUrl?.trim() || this.config.get<string>('notifications.appUrl');
      if (input.actionSource === 'website' && sourceUrl) event.event_source_url = sourceUrl;

      await this.queue.add(
        META_CAPI_JOB,
        { event },
        {
          jobId: `${event.event_name}-${event.event_id}`,
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 500,
          removeOnFail: 1_000,
        },
      );

      this.logger.debug(
        `Meta ${event.event_name} дараалалд орлоо (${matchSignalCount(userData)} тааруулах дохио)`,
      );
    } catch (error) {
      this.logger.warn(
        `Meta ${input.eventName} бүртгэгдсэнгүй: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
