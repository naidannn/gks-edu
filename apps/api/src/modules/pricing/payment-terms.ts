/**
 * Payment terms — when an invoice we raise falls due.
 *
 * `Payment.dueAt` is what the "Төлбөрийн хугацаа болсон" reminder (§16), the
 * receivables count on the payments screen, `mv_finance.overdue_mnt` and the
 * client portal's overdue badge all run on. All four read one date, so one
 * place computes it.
 *
 * The window itself is `ServicePricing.paymentDueDays`: a payment term, so it
 * is versioned with the price the way the prepayment is (`gksedu.md` §5.4),
 * not a constant. It deliberately is *not* snapshotted onto the contract the
 * way the amounts are — the amounts are what the client agreed to owe and must
 * never move under them, while this only decides when we chase, and the office
 * retuning that should apply to invoices it raises from then on.
 */

/** The office's current practice. `ARCHITECTURE.md` §18 asks them to confirm it. */
export const DEFAULT_PAYMENT_DUE_DAYS = 7;

/** A term longer than a quarter is a typo, not a policy. */
export const MAX_PAYMENT_DUE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The end of the `days`-th day after `raisedAt`, in UTC.
 *
 * End of day, because a deadline of "the 15th" means the client has the 15th —
 * the same convention `IntakeTerm.internalDeadline` and `CaseDocument.dueAt`
 * are stored under, so the portal's countdowns agree with each other.
 */
export function paymentDueAt(raisedAt: Date, days: number): Date {
  const due = new Date(raisedAt.getTime() + days * DAY_MS);
  due.setUTCHours(23, 59, 59, 999);
  return due;
}
