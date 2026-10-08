import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  FACEBOOK_ASSISTANT_QUEUE,
  FACEBOOK_COMMENT_JOB,
  FACEBOOK_INBOUND_QUEUE,
  FACEBOOK_REPLY_JOB,
} from '../../queue/queue.constants.js';
import { FacebookAssistantService } from './facebook-assistant.service.js';
import { FacebookIntakeService } from './facebook-intake.service.js';
import type { FacebookCommentJob, FacebookInboundJob, FacebookReplyJob } from './facebook.types.js';

/**
 * Stores webhook entries (2F). One at a time, so that two entries for the same
 * person are applied in the order Meta sent them.
 */
@Processor(FACEBOOK_INBOUND_QUEUE)
export class FacebookInboundProcessor extends WorkerHost {
  constructor(private readonly intake: FacebookIntakeService) {
    super();
  }

  async process(job: Job<FacebookInboundJob>): Promise<void> {
    await this.intake.ingest(job.data.entry);
  }
}

/**
 * The assistant's replies and comment answers (2F). A few at once: a turn is
 * mostly waiting on the model, and one slow answer must not hold up a second
 * person. Two jobs for the same thread cannot run together — the reply job's
 * id is the thread's.
 */
@Processor(FACEBOOK_ASSISTANT_QUEUE, { concurrency: 3 })
export class FacebookAssistantProcessor extends WorkerHost {
  private readonly logger = new Logger(FacebookAssistantProcessor.name);

  constructor(private readonly assistant: FacebookAssistantService) {
    super();
  }

  async process(job: Job<FacebookReplyJob | FacebookCommentJob>): Promise<void> {
    switch (job.name) {
      case FACEBOOK_REPLY_JOB:
        return this.assistant.replyToThread((job.data as FacebookReplyJob).threadId);
      case FACEBOOK_COMMENT_JOB:
        return this.assistant.answerComment((job.data as FacebookCommentJob).commentId);
      default:
        this.logger.warn(`Үл мэдэгдэх Facebook ажил: ${job.name}`);
    }
  }
}
