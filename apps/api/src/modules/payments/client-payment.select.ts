import { PaymentStatus, type Prisma } from '../../prisma/client.js';
import { QPAY_INVOICE_TTL_MS } from '../../queue/queue.constants.js';

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

/** What the expiry needs on top of the projection, to be read rather than guessed. */
type ClientPaymentSource = Record<ClientPaymentKey, unknown> & {
  status: PaymentStatus;
  qpayInvoiceId: string | null;
  createdAt: Date;
};

/**
 * When a QR stops working (1C-38) — sent rather than derived on the frontend,
 * so the invoice's lifetime stays one number in one file.
 *
 * `null` for anything that is not a live QPay invoice: a paid row has no
 * deadline left, and money registered at the desk never had a QR at all.
 */
export function invoiceExpiresAt(payment: Pick<ClientPaymentSource, 'status' | 'qpayInvoiceId' | 'createdAt'>): Date | null {
  if (payment.status !== PaymentStatus.PENDING || !payment.qpayInvoiceId) return null;
  return new Date(payment.createdAt.getTime() + QPAY_INVOICE_TTL_MS);
}

/**
 * The same projection applied to a row already in hand — the staff path reads
 * the whole row anyway, and a second query would cost another round trip on
 * the endpoint the payment page polls while a QR is on screen.
 */
export function toClientPayment<T extends ClientPaymentSource>(
  payment: T,
): Pick<T, ClientPaymentKey> & { expiresAt: Date | null } {
  const picked = {} as Pick<T, ClientPaymentKey>;
  // Written through an index signature: a key-by-key copy reads as `unknown`
  // and writes into the intersection of every column's type, which nothing
  // satisfies. The keys come from the projection itself, so the loop is exact.
  const target = picked as Record<ClientPaymentKey, unknown>;
  for (const key of Object.keys(CLIENT_PAYMENT_SELECT) as ClientPaymentKey[]) target[key] = payment[key];
  return { ...picked, expiresAt: invoiceExpiresAt(payment) };
}
