import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AiAssistantConfig } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateAiConfigDto } from './dto/ai-config.dto.js';

/** The single row's primary key, pinned so there can only ever be one. */
const CONFIG_ID = 'default';

const SELECT = {
  id: true,
  enabled: true,
  chatModel: true,
  fallbackModel: true,
  embeddingModel: true,
  temperature: true,
  maxOutputTokens: true,
  retrievalTopK: true,
  minSimilarity: true,
  sessionMessageLimit: true,
  sessionTokenBudget: true,
  dailyTokenBudget: true,
  leadCaptureAfterMessages: true,
  greeting: true,
  persona: true,
  ctaRules: true,
  handoffHours: true,
  copilotEnabled: true,
  updatedAt: true,
  updatedBy: { select: { id: true, name: true } },
} as const;

/**
 * The assistant's configuration (2B-02) — one row, read on every turn.
 *
 * Same arrangement as `AdmissionConfigService`: a singleton, memoised for a
 * short window so the pooler is not asked the same question twice a second, and
 * owned by the business rather than by code. Model, temperature, retrieval
 * threshold, budgets, greeting, persona, CTA rules and office hours are all
 * values somebody tunes from a screen (AI-ASSISTANT.md principle 7).
 *
 * `enabled` is the kill switch. It is checked before anything else on a turn,
 * because the point of a kill switch is that it works when the rest does not.
 */
@Injectable()
export class AiConfigService {
  private readonly logger = new Logger(AiConfigService.name);
  private cached: AiAssistantConfig | null = null;
  private cachedAt = 0;

  /** Long enough to spare a round trip per turn, short enough that a retune
   *  lands within a conversation or two. */
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  /** The row, created with the schema defaults the first time it is asked for. */
  async get(): Promise<AiAssistantConfig> {
    if (this.cached && Date.now() - this.cachedAt < AiConfigService.TTL_MS) {
      return this.cached;
    }

    const config = await this.prisma.aiAssistantConfig.upsert({
      where: { id: CONFIG_ID },
      update: {},
      create: { id: CONFIG_ID },
    });

    this.cached = config;
    this.cachedAt = Date.now();
    return config;
  }

  /**
   * Whether the assistant should answer at all.
   *
   * Deliberately fail-closed: if the config cannot be read, the widget falls
   * back to the messenger rather than answering with defaults nobody chose.
   */
  async isEnabled(): Promise<boolean> {
    try {
      return (await this.get()).enabled;
    } catch (error) {
      this.logger.error(
        `AI тохиргоо уншигдсангүй, туслахыг унтраалаа: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  async getForAdmin() {
    await this.get();
    return this.prisma.aiAssistantConfig.findUniqueOrThrow({ where: { id: CONFIG_ID }, select: SELECT });
  }

  async update(dto: UpdateAiConfigDto, actorId: string | null) {
    // The two JSON columns are `unknown` on the DTO — the shapes are the
    // business's, and validating them field by field would freeze rules the
    // office is meant to be able to change.
    const { ctaRules, handoffHours, ...scalars } = dto;
    const data = {
      ...scalars,
      ...(ctaRules !== undefined ? { ctaRules: ctaRules as Prisma.InputJsonValue } : {}),
      ...(handoffHours !== undefined ? { handoffHours: handoffHours as Prisma.InputJsonValue } : {}),
      updatedById: actorId,
    };

    const updated = await this.prisma.aiAssistantConfig.upsert({
      where: { id: CONFIG_ID },
      update: data,
      create: { id: CONFIG_ID, ...data },
      select: SELECT,
    });

    this.invalidate();
    return updated;
  }

  /**
   * Drops the memo. Called after an edit, and by anything that changes what the
   * assistant would say — the persona and the knowledge base both invalidate the
   * semantic cache downstream (2B-10).
   */
  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }

  /** Which provider a model name routes to — the 1H-16 rule, in one place. */
  static providerFor(model: string): 'deepseek' | 'gemini' {
    return model.startsWith('deepseek-') ? 'deepseek' : 'gemini';
  }
}
