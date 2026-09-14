<script setup lang="ts">
import type { PaymentItem, PaymentKind, PortalCaseDetail } from '@gks/shared';

/** Prepayment/balance invoice creation + QPay QR + status polling (1C-17). */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const { gksCase, reload } = inject('caseDetail') as { gksCase: Ref<PortalCaseDetail | null>; reload: () => Promise<void> };
const api = useApi();
const { refresh } = usePortal();
const errorMsg = ref<string | null>(null);
const meta = useMetaTracking();

const payments = computed(() => gksCase.value?.payments ?? []);
/**
 * The live row for a debt, mirroring the server's `LIVE_STATUSES`: an EXPIRED,
 * FAILED or REFUNDED row is history. Reading those as "the payment" left the
 * card showing a dead invoice with no way past it — the QR block wants PENDING
 * and the "төлөх" button only renders when there is no live payment at all, so
 * a client whose invoice timed out could never ask for a second one. The API
 * would have issued one: `openPayment` ignores those statuses too.
 */
function latest(kind: PaymentKind): PaymentItem | undefined {
  return payments.value
    .filter((p) => p.kind === kind && (p.status === 'PENDING' || p.status === 'PAID'))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
const prepayment = computed(() => latest('PREPAYMENT'));
/** QPay invoices only exist once the contract is signed (1C-12 guards this too). */
const contractSigned = computed(() =>
  Boolean(gksCase.value?.contract && ['SIGNED', 'ACTIVE', 'COMPLETED'].includes(gksCase.value.contract.status)));
const balance = computed(() => latest('BALANCE'));
const pendingPayment = computed(() => payments.value.find((p) => p.status === 'PENDING'));

/**
 * Whether the balance is due *now* — the case stands on the stage the flow
 * moves to `BALANCE_PAID` from.
 *
 * `journey` is `CASE_FLOWS[serviceType]`, which is also what the API's system
 * edges are built from, so reading the next stage off it asks the server's own
 * question: `assertReadyFor` refuses an invoice anywhere else. It has to be the
 * journey rather than a fixed stage, because the two families disagree about
 * where the balance sits — regular brokerage collects it after the visa, GKS
 * after the scholarship result (gksedu.md §9).
 *
 * The card used to appear the moment the prepayment was paid, months early,
 * with a button whose only possible outcome was an error message.
 */
const balanceDue = computed(() => {
  const journey = gksCase.value?.journey ?? [];
  const stage = gksCase.value?.stage;
  if (!stage) return false;
  return journey[journey.indexOf(stage) + 1] === 'BALANCE_PAID';
});

/** Once the money is in, the next step is almost always on another tab. */
const showNextAction = computed(
  () => prepayment.value?.status === 'PAID' && gksCase.value?.nextAction.tab !== 'payment',
);

const creating = ref<PaymentKind | null>(null);
/**
 * `reissue` is the same call with the old QR taken down first (1C-38). An
 * invoice now lives a day, so the client who cannot use the one on screen —
 * a tab left open since yesterday, a phone that will not read the image — asks
 * for another one here instead of waiting the day out.
 */
async function create(kind: PaymentKind, mode: 'create' | 'reissue' = 'create') {
  if (!gksCase.value) return;
  errorMsg.value = null;
  creating.value = kind;
  try {
    const path = mode === 'reissue' ? 'payments/reissue' : 'payments';
    const payment = await api.post<PaymentItem>(`/cases/${gksCase.value.id}/${path}`, { kind });
    await reload();
    // Both halves of this conversion key on the payment id, so neither side
    // has to tell the other anything — the API fires the same event when it
    // writes the invoice, and Meta collapses the pair (1A-38).
    meta.trackPaired('InitiateCheckout', payment.id, {
      value: Number(payment.amountMnt),
      currency: 'MNT',
      content_type: 'product',
      content_ids: [kind],
    });
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Төлбөр үүсгэж чадсангүй');
  } finally {
    creating.value = null;
  }
}

/*
 * Poll while a payment is PENDING — the same webhook/BullMQ-backed status the
 * backend maintains.
 *
 * A self-scheduling timeout rather than `setInterval`, because the body is
 * async and the interval did not wait for it: a response slower than the tick
 * overlapped the next one, a network blip rejected unhandled every three
 * seconds, and two ticks could both read PAID and report the purchase twice.
 * The next tick is scheduled only after the previous one has finished, and the
 * poll stops itself the moment it has an answer.
 */
const POLL_INTERVAL_MS = 3_000;
/**
 * How long the invoice counts as "being paid right now" (1C-38).
 *
 * The QR lives a day, and three seconds apart for a day is 28,800 requests out
 * of one forgotten tab. Somebody who is actually scanning answers within a
 * minute or two, so the fast rate covers that and everything after it drops to
 * a rate that costs nothing and still catches the payment made at lunch.
 */
const POLL_FAST_WINDOW_MS = 2 * 60 * 1000;
const POLL_SLOW_INTERVAL_MS = 30_000;

let pollTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every (re)start, so a tick from a superseded run does nothing. */
let pollRun = 0;

function stopPolling(): void {
  pollRun += 1;
  clearTimeout(pollTimer);
  pollTimer = undefined;
}

/** Measured from the invoice, not from the visit: a QR opened yesterday starts slow. */
function pollDelay(createdAt: string): number {
  const age = Date.now() - new Date(createdAt).getTime();
  return age < POLL_FAST_WINDOW_MS ? POLL_INTERVAL_MS : POLL_SLOW_INTERVAL_MS;
}

watch(pendingPayment, (payment, _previous, onCleanup) => {
  stopPolling();
  if (!payment) return;

  const run = pollRun;
  const settled = async (status: string) => {
    await reload();
    // A confirmed payment moves the case on (1C-15), so the portal's own
    // "what next" answer is stale until it is re-read.
    await refresh();
    if (status === 'PAID') {
      // The API reports this one from the QPay webhook, under the same id.
      // The browser copy exists because it is the half that carries the
      // visitor's cookies — the webhook has no browser to read them from.
      meta.trackPaired('Purchase', payment.id, {
        value: Number(payment.amountMnt),
        currency: 'MNT',
        content_type: 'product',
        content_ids: [payment.kind],
      });
    }
  };

  const tick = async () => {
    if (run !== pollRun) return;
    // A hidden tab has nobody watching it change, and a QR left open overnight
    // is exactly the tab that would otherwise ask all night.
    if (typeof document !== 'undefined' && document.hidden) {
      pollTimer = setTimeout(() => void tick(), POLL_SLOW_INTERVAL_MS);
      return;
    }
    try {
      const fresh = await api.get<{ status: string }>(`/payments/${payment.id}`);
      if (run !== pollRun) return;
      if (fresh.status !== 'PENDING') {
        stopPolling();
        await settled(fresh.status);
        return;
      }
    } catch {
      // A blip while waiting for QPay is not worth a message: the QR is still
      // on screen and the next tick asks again.
    }
    if (run !== pollRun) return;
    pollTimer = setTimeout(() => void tick(), pollDelay(payment.createdAt));
  };

  // Coming back to the tab asks at once rather than waiting out the slow tick —
  // the client has just paid on their phone and is looking at this screen.
  if (typeof document !== 'undefined') {
    const onVisible = () => {
      if (run !== pollRun || document.hidden) return;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(() => void tick(), 0);
    };
    document.addEventListener('visibilitychange', onVisible);
    onCleanup(() => document.removeEventListener('visibilitychange', onVisible));
  }

  pollTimer = setTimeout(() => void tick(), pollDelay(payment.createdAt));
}, { immediate: true });
onBeforeUnmount(stopPolling);

</script>

<template>
  <div class="gks-payment">
    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>

    <DsCard v-if="!contractSigned" title="Төлбөр">
      <p class="gks-payment__unknown">
        {{ gksCase?.contract
          ? 'Гэрээгээ баталгаажуулсны дараа урьдчилгаа төлбөрийн нэхэмжлэх үүснэ.'
          : 'Гэрээ байгуулагдсаны дараа төлбөр төлөх боломжтой болно.' }}
      </p>
      <DsButton
        variant="secondary"
        size="sm"
        class="gks-payment__link"
        @click="navigateTo(`/app/cases/${gksCase?.id}/contract`)"
      >
        Гэрээ рүү очих
      </DsButton>
    </DsCard>

    <template v-else>
      <DsCard title="Урьдчилгаа">
        <template v-if="prepayment">
          <p class="gks-payment__amount gks-tnum">{{ formatMntOrDash(prepayment.amountMnt) }}</p>
          <DsBadge :tone="prepayment.status === 'PAID' ? 'success' : 'warning'">{{ PAYMENT_STATUS_LABELS[prepayment.status] }}</DsBadge>
          <div v-if="prepayment.status === 'PENDING'" class="gks-payment__qr">
            <img v-if="prepayment.qrImage" :src="`data:image/png;base64,${prepayment.qrImage}`" alt="QPay QR" class="gks-payment__qr-img">
            <p v-else class="gks-payment__qr-text gks-tnum">{{ prepayment.qrText }}</p>
            <p class="gks-payment__hint">QPay апп-аар уншуулж төлнө үү. Төлбөр баталгаажмагц энэ хуудас автоматаар шинэчлэгдэнэ.</p>
            <p v-if="prepayment.expiresAt" class="gks-payment__hint">
              Энэ QR код <strong>{{ formatDayMonthTime(prepayment.expiresAt) }}</strong> хүртэл хүчинтэй.
            </p>
            <DsButton
              variant="ghost"
              size="sm"
              :loading="creating === 'PREPAYMENT'"
              @click="create('PREPAYMENT', 'reissue')"
            >
              Шинэ QR код авах
            </DsButton>
          </div>
        </template>
        <DsButton v-else :loading="creating === 'PREPAYMENT'" @click="create('PREPAYMENT')">Урьдчилгаа төлөх</DsButton>
      </DsCard>

      <!-- A client who has just paid is standing on this screen, and a badge
           turning green says nothing about where they go next — which is how
           "төлчихөөд гацлаа" starts. The server already answers that question
           for the overview; the same card answers it here, so the wording
           cannot drift and the step is never invented locally. -->
      <PortalNextActionCard
        v-if="gksCase && showNextAction"
        :action="gksCase.nextAction"
        :case-id="gksCase.id"
      />

      <DsCard v-if="balanceDue || balance" title="Үлдэгдэл">
        <template v-if="balance">
          <p class="gks-payment__amount gks-tnum">{{ formatMntOrDash(balance.amountMnt) }}</p>
          <DsBadge :tone="balance.status === 'PAID' ? 'success' : 'warning'">{{ PAYMENT_STATUS_LABELS[balance.status] }}</DsBadge>
          <div v-if="balance.status === 'PENDING'" class="gks-payment__qr">
            <img v-if="balance.qrImage" :src="`data:image/png;base64,${balance.qrImage}`" alt="QPay QR" class="gks-payment__qr-img">
            <p v-else class="gks-payment__qr-text gks-tnum">{{ balance.qrText }}</p>
            <p v-if="balance.expiresAt" class="gks-payment__hint">
              Энэ QR код <strong>{{ formatDayMonthTime(balance.expiresAt) }}</strong> хүртэл хүчинтэй.
            </p>
            <DsButton variant="ghost" size="sm" :loading="creating === 'BALANCE'" @click="create('BALANCE', 'reissue')">
              Шинэ QR код авах
            </DsButton>
          </div>
        </template>
        <DsButton v-else :loading="creating === 'BALANCE'" @click="create('BALANCE')">Үлдэгдэл төлөх</DsButton>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-payment { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-payment__unknown { color: var(--text-subtle); font-style: italic; }
.gks-payment__amount { font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); margin-bottom: var(--sp-2); }
.gks-payment__qr { margin-top: var(--sp-4); display: flex; flex-direction: column; align-items: center; gap: var(--sp-3); text-align: center; }
.gks-payment__qr-img { width: 220px; height: 220px; }
.gks-payment__qr-text { padding: var(--sp-3); background: var(--surface-sunken); word-break: break-all; }
.gks-payment__hint { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-payment__link { margin-top: var(--sp-4); }
</style>
