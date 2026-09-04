import { Injectable, Logger } from '@nestjs/common';

/**
 * The Mongolian SMS gateway is still an open business question
 * (ARCHITECTURE.md §18, question 10). Until one is chosen, this logs instead
 * of sending — swap the body of `send()` for a real gateway call once
 * `sms.provider` grows a second option.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async send(phone: string, message: string): Promise<void> {
    this.logger.log(`[SMS→${phone}] ${message}`);
  }
}
