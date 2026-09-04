import { Injectable, NotFoundException } from '@nestjs/common';
import { type DecimalLike, toNumber } from '../../common/utils/decimal.js';
import { PrepaymentMode, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateServicePricingDto } from './dto/create-service-pricing.dto.js';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

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
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    return this.prisma.$transaction(async (tx) => {
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
