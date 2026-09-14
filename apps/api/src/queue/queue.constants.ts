/**
 * QPay polling fallback (1C-14) — 10s interval, per invoice, `jobId` = paymentId
 * for idempotent (re-)scheduling. This is the *fast* tier: it covers the person
 * standing in front of the QR with their phone out, and stops after a quarter of
 * an hour. What happens for the rest of the invoice's day is `QPAY_SWEEP_QUEUE`.
 */
export const QPAY_POLL_QUEUE = 'qpay-poll';
export const QPAY_POLL_JOB = 'poll-invoice';
export const QPAY_POLL_INTERVAL_MS = 10_000;
/** How long the per-invoice scheduler keeps asking before the sweep takes over. */
export const QPAY_POLL_WINDOW_MS = 15 * 60 * 1000;
export const QPAY_POLL_LIMIT = Math.ceil(QPAY_POLL_WINDOW_MS / QPAY_POLL_INTERVAL_MS);

/**
 * How long an unpaid QPay invoice stays scannable (1C-38).
 *
 * It used to be the same fifteen minutes as the poll, because one constant did
 * both jobs — and fifteen minutes is the length of a QR session, not of a
 * decision. A client who opened the invoice on a laptop and went to find their
 * phone, or who wanted to move money across from another bank first, came back
 * to a dead QR and no way to ask for another one. A day is the office's answer.
 */
export const QPAY_INVOICE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The slow tier (1C-38): every open invoice is re-checked against QPay, and one
 * that has run out its day is retired. A sweep rather than a longer per-invoice
 * schedule because polling each invoice every ten seconds for a day would be
 * 8,640 jobs apiece; the office never has more than a handful open at once, so
 * one query every couple of minutes covers all of them together.
 *
 * Two minutes is chosen against the webhook, not against the client: the
 * callback credits a payment in about a second, and this only runs at all when
 * that callback never arrived.
 */
export const QPAY_SWEEP_QUEUE = 'qpay-sweep';
export const QPAY_SWEEP_JOB = 'sweep-open-invoices';
export const QPAY_SWEEP_INTERVAL_MS = 2 * 60 * 1000;

/** Daily Mongolbank FX pull (1E-07) — invoices snapshot the rate, so one fetch a day is enough. */
export const FX_RATE_QUEUE = 'fx-rates';
export const FX_RATE_JOB = 'fetch-daily-rate';
export const FX_RATE_INTERVAL_MS = 12 * 60 * 60 * 1000;

/** Notification delivery (1G-02) — one job per pending `Notification` row. */
export const NOTIFICATION_QUEUE = 'notifications';
export const NOTIFICATION_DELIVER_JOB = 'deliver';
/**
 * Sweeps up rows that were written `PENDING` but never reached the queue —
 * Redis down at dispatch time swallows the enqueue, and for a scheduled
 * reminder the `dedupeKey` then blocks every later attempt (1N-22).
 */
export const NOTIFICATION_REQUEUE_JOB = 'requeue-stale';
export const NOTIFICATION_REQUEUE_INTERVAL_MS = 15 * 60 * 1000;
/** Younger than this and the first delivery attempt may simply still be queued. */
export const NOTIFICATION_STALE_AFTER_MS = 10 * 60 * 1000;

/** Scheduled reminder sweeps (1G-07) — payments, visa, departure, follow-ups. */
export const REMINDER_SWEEP_QUEUE = 'reminder-sweeps';
export const REMINDER_SWEEP_JOB = 'sweep-all';
export const REMINDER_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Nightly GKS ranking recompute (1A-30) — also queued ad hoc after a catalogue edit. */
export const GKS_RANKING_QUEUE = 'gks-ranking';
export const GKS_RANKING_JOB = 'recompute-ranking';
export const GKS_RANKING_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Gemini intake-date research (1H-10). Not a scheduler — jobs are added when
 * staff press "Интернэтээс судлах". A grounded search runs 30-90s, which is
 * why it is a job at all: the request would otherwise time out behind nginx.
 */
export const INTAKE_RESEARCH_QUEUE = 'intake-research';
export const INTAKE_RESEARCH_JOB = 'research-intakes';

/**
 * Gemini programme/tuition research. Same arrangement as the intake search
 * above: not a scheduler, jobs are added when staff press "Интернэтээс судлах",
 * and a grounded search runs 30-90s, which is why it is a job at all.
 */
export const PROGRAM_RESEARCH_QUEUE = 'program-research';
export const PROGRAM_RESEARCH_JOB = 'research-programs';

/**
 * Meta Conversions API delivery (1A-38) — one job per server event. Not a
 * scheduler: jobs are added the moment a conversion happens, and the queue
 * exists so that Facebook being slow or down can never hold up a lead, a
 * registration or a payment confirmation.
 */
export const META_CAPI_QUEUE = 'meta-capi';
export const META_CAPI_JOB = 'send-event';
