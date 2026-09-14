import { Injectable, Logger } from '@nestjs/common';
import { SlackService } from '../../notifications/slack.service.js';
import { AiConfigService } from '../ai-config.service.js';
import { ChatSessionService } from './chat-session.service.js';

/** The two marks worth telling the office about. */
const WARN_AT = 0.8;

export interface BudgetState {
  spent: number;
  limit: number;
  /** 0–1; above 1 the assistant is quiet for the rest of the day. */
  ratio: number;
  exhausted: boolean;
}

/**
 * The daily spending ceiling (2B-12, AI-ASSISTANT.md §13, §15-31).
 *
 * The business set a limit of about $60 a month, which is roughly three million
 * tokens a day. Two things follow from that being a *business* number rather
 * than an engineering one: hitting it is not an error — the assistant goes quiet
 * and the widget routes to a person — and somebody has to be told before it
 * happens, not after.
 *
 * So the office is pinged once at 80% and once at 100%, and not again that day.
 * An alert that repeats every turn for the rest of the afternoon is an alert
 * people learn to ignore.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  /** `YYYY-MM-DD` of the day each threshold was last announced. */
  private announced = { warn: '', full: '' };

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly sessions: ChatSessionService,
    private readonly slack: SlackService,
  ) {}

  async check(): Promise<BudgetState> {
    const config = await this.aiConfig.get();
    const spent = await this.sessions.tokensSpentToday();
    const limit = config.dailyTokenBudget;
    const ratio = limit > 0 ? spent / limit : 0;

    await this.announce(ratio, spent, limit);

    return { spent, limit, ratio, exhausted: ratio >= 1 };
  }

  private async announce(ratio: number, spent: number, limit: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);

    if (ratio >= 1 && this.announced.full !== today) {
      this.announced.full = today;
      this.logger.warn(`Өдрийн токены тааз дүүрлээ: ${spent}/${limit}`);
      await this.slack.notify({
        emoji: '🛑',
        title: 'AI туслахын өдрийн төсөв дууслаа',
        fields: [
          { label: 'Зарцуулсан', value: `${spent.toLocaleString('en-US')} токен` },
          { label: 'Тааз', value: `${limit.toLocaleString('en-US')} токен` },
          { label: 'Юу болох вэ', value: 'Туслах маргааш хүртэл хариулахгүй; виджет зөвлөгөөний форм руу чиглүүлнэ.' },
        ],
        link: { label: 'Тохиргоо', path: '/admin/ai/knowledge' },
      });
      return;
    }

    if (ratio >= WARN_AT && ratio < 1 && this.announced.warn !== today) {
      this.announced.warn = today;
      await this.slack.notify({
        emoji: '⚠️',
        title: 'AI туслах өдрийн төсвийн 80%-д хүрлээ',
        fields: [
          { label: 'Зарцуулсан', value: `${spent.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} токен` },
        ],
      });
    }
  }
}
