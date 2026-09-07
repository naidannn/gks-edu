import { Injectable, Logger } from '@nestjs/common';
import type { AdmissionConfig } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UpdateAdmissionConfigDto } from './dto/admission-config.dto.js';

/** The single row's primary key, pinned so there can only ever be one. */
const CONFIG_ID = 'default';

const SELECT = {
  id: true,
  internalLeadDays: true,
  clientReminderOffsets: true,
  staffReminderOffsets: true,
  riskReadinessThreshold: true,
  researchModel: true,
  programResearchModel: true,
  updatedAt: true,
  updatedBy: { select: { id: true, name: true } },
} as const;

/**
 * Admissions configuration (1H-02) — one row, read on nearly every admissions
 * request, so it is memoised for a short window rather than fetched each time.
 *
 * The values here are the office's *current* rules, not constants: the 7-day
 * internal lead time and the reminder ladder are tuned from the admin screen,
 * the same way `ServicePricing` holds today's 1,200,000₮ (CLAUDE.md).
 */
@Injectable()
export class AdmissionConfigService {
  private readonly logger = new Logger(AdmissionConfigService.name);
  private cached: AdmissionConfig | null = null;
  private cachedAt = 0;

  /** Long enough to spare the pooler a round trip per request, short enough
   *  that a retune is visible within a page refresh or two. */
  private static readonly TTL_MS = 30_000;

  constructor(private readonly prisma: PrismaService) {}

  /** The row, creating it with the schema defaults the first time it is asked for. */
  async get(): Promise<AdmissionConfig> {
    if (this.cached && Date.now() - this.cachedAt < AdmissionConfigService.TTL_MS) {
      return this.cached;
    }

    const config = await this.prisma.admissionConfig.upsert({
      where: { id: CONFIG_ID },
      update: {},
      create: { id: CONFIG_ID },
    });

    this.cached = config;
    this.cachedAt = Date.now();
    return config;
  }

  /** Just the lead time — the value nearly every caller actually wants. */
  async getInternalLeadDays(): Promise<number> {
    return (await this.get()).internalLeadDays;
  }

  async getForAdmin() {
    await this.get();
    return this.prisma.admissionConfig.findUniqueOrThrow({ where: { id: CONFIG_ID }, select: SELECT });
  }

  /**
   * Retunes the config. Changing `internalLeadDays` moves every automatic
   * internal deadline, so the caller (`AdmissionsService`) recomputes them —
   * this method only stores the values and drops the memo.
   */
  async update(dto: UpdateAdmissionConfigDto, actorId: string | null) {
    const updated = await this.prisma.admissionConfig.upsert({
      where: { id: CONFIG_ID },
      update: { ...dto, updatedById: actorId },
      create: { id: CONFIG_ID, ...dto, updatedById: actorId },
      select: SELECT,
    });

    this.invalidate();
    this.logger.log(`Элсэлтийн тохиргоо шинэчлэгдлээ: ${JSON.stringify(dto)}`);
    return updated;
  }

  invalidate(): void {
    this.cached = null;
    this.cachedAt = 0;
  }
}
