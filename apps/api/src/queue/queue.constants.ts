/** QPay polling fallback (1C-14) — 10s interval, per invoice, `jobId` = paymentId for idempotent (re-)scheduling. */
export const QPAY_POLL_QUEUE = 'qpay-poll';
export const QPAY_POLL_JOB = 'poll-invoice';
export const QPAY_POLL_INTERVAL_MS = 10_000;
export const QPAY_POLL_TIMEOUT_MS = 15 * 60 * 1000;
export const QPAY_POLL_LIMIT = Math.ceil(QPAY_POLL_TIMEOUT_MS / QPAY_POLL_INTERVAL_MS);
