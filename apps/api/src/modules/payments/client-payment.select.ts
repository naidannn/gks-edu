import type { Prisma } from '../../prisma/client.js';

/**
 * What a payment may say to the person who owes it (1N-04).
 *
 * Deliberately a select rather than an omit: a column added to `Payment`
 * later is staff-only until somebody decides otherwise, which is the safe
 * direction for a table that carries money.
 *
 * Left out on purpose — `note` is the remark staff write at the desk about who
 * handed the cash over, `receiptPath` and `createdById` are internal, and
 * `qpayPaymentId` is QPay's own reference, which belongs in a reconciliation
 * screen and nowhere else.
 */
export const CLIENT_PAYMENT_SELECT = {
  id: true,
  caseId: true,
  kind: true,
  amountMnt: true,
  status: true,
  method: true,
  reference: true,
  qpayInvoiceId: true,
  qrText: true,
  qrImage: true,
  paidAt: true,
  /** The client is chased on this date, so they get to see it. */
  dueAt: true,
  refundOfId: true,
  createdAt: true,
} satisfies Prisma.PaymentSelect;

type ClientPaymentKey = keyof typeof CLIENT_PAYMENT_SELECT;

/**
 * The same projection applied to a row already in hand — the staff path reads
 * the whole row anyway, and a second query would cost another round trip on
 * the endpoint the payment page polls while a QR is on screen.
 */
export function toClientPayment<T extends Record<ClientPaymentKey, unknown>>(payment: T): Pick<T, ClientPaymentKey> {
  const picked = {} as Pick<T, ClientPaymentKey>;
  for (const key of Object.keys(CLIENT_PAYMENT_SELECT) as ClientPaymentKey[]) picked[key] = payment[key];
  return picked;
}
