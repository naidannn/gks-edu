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
 * The next number comes from the **highest code already issued**, never from a
 * count of the rows. A count only agrees with the highest while nothing has
 * ever been deleted: clear five test clients out of fifteen and the count says
 * eleven is free when eleven is taken, so the next five registrations each die
 * on the unique index instead of taking the next free number. Reading the
 * maximum is deletion-proof — it leaves a gap where the removed row was and
 * carries on.
 *
 * Finding that maximum is the caller's job — it is the only part that differs,
 * and passing the delegate in keeps this free of any Prisma model type. The
 * suffix is zero-padded to a fixed width, so the lexicographic maximum and the
 * numeric maximum are the same row and an `orderBy: { code: 'desc' }` is enough.
 *
 * The read is a *suggestion*, not a lock: two records created in the same
 * second see the same maximum and want the same number. The unique index on
 * `code` is the real guard, exactly as it is for contract numbers.
 */
export async function nextYearlyCode(
  prefix: string,
  highestWithPrefix: (stem: string) => Promise<string | null>,
): Promise<string> {
  const stem = `${prefix}-${new Date().getFullYear()}-`;
  const highest = await highestWithPrefix(stem);
  const used = highest ? Number.parseInt(highest.slice(stem.length), 10) : 0;
  return `${stem}${((Number.isFinite(used) ? used : 0) + 1).toString().padStart(4, '0')}`;
}
