import type { Prisma } from '../../prisma/client.js';

/**
 * `University.livingCost` — an untyped JSON column, read in one place.
 *
 * It is a regional estimate carried over from the reference data, so nothing
 * here trusts the shape: anything unexpected reads as `null`, which downstream
 * means "unknown" and never zero. The planner quotes the range and the GKS
 * ranking scores the upper end; both used to reimplement this.
 */
export interface LivingCostJson {
  tierLabelMn?: string;
  monthlyTotalMin?: number | null;
  monthlyTotalMax?: number | null;
}

export function readLivingCost(value: Prisma.JsonValue | null | undefined): LivingCostJson | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as LivingCostJson;
}

/** A positive monthly figure, or `null` — a 0 in the data is not a price. */
function positive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function livingCostMonthlyMin(value: Prisma.JsonValue | null | undefined): number | null {
  return positive(readLivingCost(value)?.monthlyTotalMin);
}

export function livingCostMonthlyMax(value: Prisma.JsonValue | null | undefined): number | null {
  return positive(readLivingCost(value)?.monthlyTotalMax);
}
