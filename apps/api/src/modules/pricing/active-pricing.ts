import type { Prisma } from '../../prisma/client.js';

/**
 * "The row in force at `at`" — one definition, because pricing is versioned by
 * a half-open interval and the three places that used to spell it out could
 * each have got the boundary wrong on its own (§6.1).
 *
 * `effectiveTo` is exclusive: the moment a new row takes effect is the moment
 * the old one stops, and neither of them may answer for it twice.
 */
export function activePricingWhere(at: Date): Prisma.ServicePricingWhereInput {
  return { effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] };
}
