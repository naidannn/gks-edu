import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { BalanceTrigger, PrepaymentMode, ServiceType } from '../../prisma/client.js';
import type { CacheService } from '../../redis/cache.service.js';
import { PricingService } from './pricing.service.js';

const activeRow = {
  id: 'pricing-1',
  serviceType: ServiceType.LANGUAGE_PREP,
  totalAmount: { toString: () => '1200000' },
  prepaymentMode: PrepaymentMode.FIXED,
  prepaymentValue: { toString: () => '200000' },
  balanceTrigger: BalanceTrigger.AFTER_VISA_APPROVED,
  effectiveFrom: new Date('2026-01-01'),
  effectiveTo: null as Date | null,
};

function buildHarness(row: Record<string, unknown> | null = activeRow) {
  const prisma = {
    servicePricing: {
      findUnique: vi.fn().mockResolvedValue(row),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'pricing-1', ...data })),
    },
  };
  const cache = { del: vi.fn().mockResolvedValue(undefined) } as unknown as CacheService;
  const service = new PricingService(prisma as unknown as PrismaService, cache);
  return { service, prisma, cache };
}

describe('PricingService.update', () => {
  it('corrects the active row in place and drops the public cache', async () => {
    const { service, prisma, cache } = buildHarness();

    const updated = await service.update('pricing-1', { totalAmount: 1_300_000 });

    expect(prisma.servicePricing.update).toHaveBeenCalledWith({
      where: { id: 'pricing-1' },
      // Untouched fields carry over from the row, not from a partial write.
      data: {
        totalAmount: 1_300_000,
        prepaymentMode: PrepaymentMode.FIXED,
        prepaymentValue: 200_000,
        balanceTrigger: BalanceTrigger.AFTER_VISA_APPROVED,
      },
    });
    expect(updated.totalAmount).toBe(1_300_000);
    expect(cache.del).toHaveBeenCalled();
  });

  it('refuses a row that has already been superseded', async () => {
    const { service } = buildHarness({ ...activeRow, effectiveTo: new Date('2026-06-01') });

    await expect(service.update('pricing-1', { totalAmount: 1 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s on an unknown id', async () => {
    const { service } = buildHarness(null);

    await expect(service.update('nope', { totalAmount: 1 })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a fixed prepayment larger than the total it is part of', async () => {
    const { service } = buildHarness();

    await expect(service.update('pricing-1', { prepaymentValue: 2_000_000 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a percent prepayment above 100 — including one left over from a FIXED row', async () => {
    const { service } = buildHarness();

    // 200,000 was a valid ₮ amount; as a percentage it is nonsense.
    await expect(service.update('pricing-1', { prepaymentMode: PrepaymentMode.PERCENT })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('allows a coherent switch to percent', async () => {
    const { service } = buildHarness();

    const updated = await service.update('pricing-1', { prepaymentMode: PrepaymentMode.PERCENT, prepaymentValue: 20 });

    expect(updated.prepaymentMode).toBe(PrepaymentMode.PERCENT);
    expect(updated.prepaymentValue).toBe(20);
  });
});
