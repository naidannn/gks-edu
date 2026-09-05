/** QPay polling fallback (1C-14) — 10s interval, per invoice, `jobId` = paymentId for idempotent (re-)scheduling. */
export const QPAY_POLL_QUEUE = 'qpay-poll';
export const QPAY_POLL_JOB = 'poll-invoice';
export const QPAY_POLL_INTERVAL_MS = 10_000;
export const QPAY_POLL_TIMEOUT_MS = 15 * 60 * 1000;
export const QPAY_POLL_LIMIT = Math.ceil(QPAY_POLL_TIMEOUT_MS / QPAY_POLL_INTERVAL_MS);

/** Document deadline reminders (1D-12) — one sweep a day, D-7/D-3/D-1. */
export const DOCUMENT_REMINDER_QUEUE = 'document-reminders';
export const DOCUMENT_REMINDER_JOB = 'sweep-due-documents';
export const DOCUMENT_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REMINDER_OFFSET_DAYS = [7, 3, 1] as const;

/** Daily Mongolbank FX pull (1E-07) — invoices snapshot the rate, so one fetch a day is enough. */
export const FX_RATE_QUEUE = 'fx-rates';
export const FX_RATE_JOB = 'fetch-daily-rate';
export const FX_RATE_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Notification delivery (1G-02) — one job per pending `Notification` row. */
export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFICATION_DELIVER_JOB = 'deliver';

/** Scheduled reminder sweeps (1G-07) — payments, visa, departure, follow-ups. */
export const REMINDER_SWEEP_QUEUE = 'reminder-sweeps';
export const REMINDER_SWEEP_JOB = 'sweep-all';
export const REMINDER_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Nightly refresh of the report materialized views (1G-08). */
export const REPORT_REFRESH_QUEUE = 'report-refresh';
export const REPORT_REFRESH_JOB = 'refresh-views';
export const REPORT_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Nightly GKS ranking recompute (1A-30) — also queued ad hoc after a catalogue edit. */
export const GKS_RANKING_QUEUE = 'gks-ranking';
export const GKS_RANKING_JOB = 'recompute-ranking';
export const GKS_RANKING_INTERVAL_MS = 24 * 60 * 60 * 1000;
