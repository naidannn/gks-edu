import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type DecimalLike, toNumber } from '../../common/utils/decimal.js';
import { PrepaymentMode, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { CreateServicePricingDto } from './dto/create-service-pricing.dto.js';
import type { UpdateServicePricingDto } from './dto/update-service-pricing.dto.js';

/** Prices change a few times a year; the service pages ask on every visit. */
const PUBLIC_CACHE_KEY = 'pricing:public';
const PUBLIC_CACHE_TTL_MS = 300_000;

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** All price history for a service, most recent first (1C-19). */
  async list(serviceType?: ServiceType) {
    return this.prisma.servicePricing.findMany({
      where: serviceType ? { serviceType } : undefined,
      orderBy: { effectiveFrom: 'desc' },
    });
  }

  /** The pricing in effect right now for a service (§6.1) — never null once seeded. */
  async getActive(serviceType: ServiceType, at: Date = new Date()) {
    const pricing = await this.prisma.servicePricing.findFirst({
      where: {
        serviceType,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!pricing) {
      throw new NotFoundException(`${serviceType} үйлчилгээнд идэвхтэй үнэ тохируулагдаагүй байна`);
    }
    return pricing;
  }

  /**
   * What the public service pages quote (1A-10). Prices are published
   * commercial information, so this is readable without a login — but only the
   * *current* row and only the four figures a visitor needs; history and
   * `balanceTrigger` stay behind the staff endpoints.
   */
  async publicPricing() {
    return this.cache.wrap(PUBLIC_CACHE_KEY, () => this.readPublicPricing(), PUBLIC_CACHE_TTL_MS);
  }

  private async readPublicPricing() {
    const now = new Date();
    const rows = await this.prisma.servicePricing.findMany({
      where: { effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
      orderBy: { effectiveFrom: 'desc' },
    });

    // One row per service — the newest effective row wins if two overlap.
    const bySer = new Map<ServiceType, (typeof rows)[number]>();
    for (const row of rows) if (!bySer.has(row.serviceType)) bySer.set(row.serviceType, row);

    return [...bySer.values()].map((row) => ({
      serviceType: row.serviceType,
      totalAmount: toNumber(row.totalAmount as DecimalLike),
      prepaymentMode: row.prepaymentMode,
      prepaymentValue: toNumber(row.prepaymentValue as DecimalLike),
      /** Convenience for the page: the actual first payment in ₮. */
      prepaymentAmount:
        row.prepaymentMode === PrepaymentMode.PERCENT
          ? Math.round((toNumber(row.totalAmount as DecimalLike) * toNumber(row.prepaymentValue as DecimalLike)) / 100)
          : toNumber(row.prepaymentValue as DecimalLike),
    }));
  }

  /**
   * Closes out the currently active row (if any) and opens a new one — pricing
   * is versioned, never edited in place (§6.1), so an existing `Contract`
   * snapshot never drifts when the price changes later.
   */
  async create(dto: CreateServicePricingDto) {
    PricingService.assertCoherent(dto);
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const current = await tx.servicePricing.findFirst({
        where: { serviceType: dto.serviceType, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (current) {
        await tx.servicePricing.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom } });
      }

      return tx.servicePricing.create({
        data: {
          serviceType: dto.serviceType,
          totalAmount: dto.totalAmount,
          prepaymentMode: dto.prepaymentMode,
          prepaymentValue: dto.prepaymentValue,
          balanceTrigger: dto.balanceTrigger,
          effectiveFrom,
        },
      });
    });

    await this.cache.del(PUBLIC_CACHE_KEY);
    return created;
  }

  /**
   * Corrects the row currently in effect, in place. Versioning protects a
   * *price change* — the old figure has to stay readable, because contracts
   * signed under it refer to it. A mistyped figure is not a price change: it
   * was never in force, and versioning past it would leave a price the office
   * never charged sitting in the history. So this edits, and it edits only the
   * open row — anything with an `effectiveTo` has already been superseded and
   * is a record of what we charged.
   */
  async update(id: string, dto: UpdateServicePricingDto) {
    const current = await this.prisma.servicePricing.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('Үнийн хувилбар олдсонгүй');
    }
    if (current.effectiveTo) {
      throw new BadRequestException('Хаагдсан хувилбарыг засах боломжгүй — шинэ хувилбар нэмнэ үү');
    }

    const merged = {
      totalAmount: dto.totalAmount ?? toNumber(current.totalAmount as DecimalLike),
      prepaymentMode: dto.prepaymentMode ?? current.prepaymentMode,
      prepaymentValue: dto.prepaymentValue ?? toNumber(current.prepaymentValue as DecimalLike),
      balanceTrigger: dto.balanceTrigger ?? current.balanceTrigger,
    };
    PricingService.assertCoherent(merged);

    const updated = await this.prisma.servicePricing.update({ where: { id }, data: merged });

    await this.cache.del(PUBLIC_CACHE_KEY);
    return updated;
  }

  /**
   * The one rule the field-by-field validators cannot see: a prepayment only
   * means something *relative to* the total. A percent above 100, or a fixed
   * prepayment larger than the price itself, would leave `amounts()` handing
   * back a negative balance and the contract quoting it.
   */
  private static assertCoherent(pricing: {
    totalAmount: number;
    prepaymentMode: PrepaymentMode;
    prepaymentValue: number;
  }): void {
    if (pricing.prepaymentMode === PrepaymentMode.PERCENT) {
      if (pricing.prepaymentValue > 100) {
        throw new BadRequestException('Хувиар тооцох урьдчилгаа 100%-иас их байж болохгүй');
      }
      return;
    }
    if (pricing.prepaymentValue > pricing.totalAmount) {
      throw new BadRequestException('Урьдчилгаа нийт төлбөрөөс их байж болохгүй');
    }
  }

  /** Resolves a pricing snapshot's prepayment/balance MNT amounts (gksedu.md §5.4). */
  static amounts(pricing: {
    totalAmount: DecimalLike;
    prepaymentMode: PrepaymentMode;
    prepaymentValue: DecimalLike;
  }) {
    const total = toNumber(pricing.totalAmount);
    const value = toNumber(pricing.prepaymentValue);
    const prepayment = pricing.prepaymentMode === PrepaymentMode.PERCENT ? Math.round((total * value) / 100) : value;
    return { prepayment, balance: total - prepayment };
  }
}
