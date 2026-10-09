import { describe, expect, it, vi } from 'vitest';
import {
  AccessLevel,
  BalanceTrigger,
  PrepaymentMode,
  ServiceType,
} from '../../../../prisma/client.js';
import type { FxService } from '../../../fx/fx.service.js';
import type { PricingService } from '../../../pricing/pricing.service.js';
import { PricingTools } from './pricing.tools.js';
import type { ToolContext } from './tool.types.js';

/**
 * 2026-10-09: the office will quote ordinary brokerage prices to anyone, balance
 * timing included — and will not quote the GKS scholarship fee yet.
 */
const row = (over: Record<string, unknown> = {}) => ({
  totalAmount: 1_200_000,
  prepaymentMode: PrepaymentMode.FIXED,
  prepaymentValue: 200_000,
  prepaymentDueDays: 3,
  balanceTrigger: BalanceTrigger.AFTER_VISA_APPROVED,
  balanceDueDays: 7,
  ...over,
});

function pricingTool() {
  const getActive = vi.fn(async () => row());
  const tools = new PricingTools({ getActive } as unknown as PricingService, {} as FxService);
  const tool = tools.tools().find((candidate) => candidate.name === 'get_service_pricing')!;
  const run = (serviceType: ServiceType, level: AccessLevel) =>
    tool.run({ serviceType }, { level } as unknown as ToolContext);

  return { tool, run, getActive };
}

describe('get_service_pricing', () => {
  it('is available to a guest', () => {
    expect(pricingTool().tool.minLevel).toBe(AccessLevel.PUBLIC);
  });

  it.each([AccessLevel.PUBLIC, AccessLevel.REGISTERED])(
    'quotes ordinary brokerage to %s with the balance timing',
    async (level) => {
      const { run } = pricingTool();
      const outcome = await run(ServiceType.BACHELOR, level);

      expect(outcome.data).toMatchObject({
        нийт_төгрөг: 1_200_000,
        урьдчилгаа_төгрөг: 200_000,
        үлдэгдэл_төгрөг: 1_000_000,
        үлдэгдлийг_хэзээ: 'Виз гарсны дараа',
      });
    },
  );

  it.each([AccessLevel.PUBLIC, AccessLevel.REGISTERED])(
    'withholds the GKS fee from %s and never reads the price row',
    async (level) => {
      const { run, getActive } = pricingTool();
      const outcome = await run(ServiceType.GKS_SCHOLARSHIP, level);

      expect(getActive).not.toHaveBeenCalled();
      expect(outcome.data).toMatchObject({ found: false });
      expect(JSON.stringify(outcome.data)).not.toMatch(/\d{6,}/);
      expect(outcome.card).toBeUndefined();
    },
  );

  it('still tells a contracted client their GKS fee, with the scholarship-result timing', async () => {
    const { run, getActive } = pricingTool();
    getActive.mockResolvedValueOnce(
      row({
        totalAmount: 5_000_000,
        prepaymentValue: 1_500_000,
        balanceTrigger: BalanceTrigger.AFTER_SCHOLARSHIP_RESULT,
      }),
    );

    const outcome = await run(ServiceType.GKS_SCHOLARSHIP, AccessLevel.CONTRACTED);

    expect(outcome.data).toMatchObject({
      нийт_төгрөг: 5_000_000,
      үлдэгдлийг_хэзээ: 'Тэтгэлгийн дүн зарлагдсаны дараа',
    });
  });
});
