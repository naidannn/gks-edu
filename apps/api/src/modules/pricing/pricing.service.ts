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
