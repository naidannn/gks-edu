/**
 * `KH-2026-0007` — a human-quotable record number whose sequence restarts every
 * calendar year.
 *
 * Three aggregates hand these out (client, case, conversation) and every one of
 * them wants the same thing: the same width, the same separator, and a counter
 * that resets in January so the number stays short and readable over the phone.
 * Written once here because three copies of the arithmetic is three chances for
 * one of them to drift to five digits or to keep counting across the new year.
 *
 * Counting is the caller's job — it is the only part that differs, and passing
 * the delegate in keeps this free of any Prisma model type.
 *
 * The count is a *suggestion*, not a lock: two records created in the same
 * second read the same count and want the same number. The unique index on
 * `code` is the real guard, exactly as it is for contract numbers.
 */
export async function nextYearlyCode(
  prefix: string,
  countWithPrefix: (stem: string) => Promise<number>,
): Promise<string> {
  const stem = `${prefix}-${new Date().getFullYear()}-`;
  const used = await countWithPrefix(stem);
  return `${stem}${(used + 1).toString().padStart(4, '0')}`;
}
