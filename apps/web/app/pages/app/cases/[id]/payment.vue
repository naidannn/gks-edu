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
function latest(kind: PaymentKind): PaymentItem | undefined {
  return payments.value.filter((p) => p.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
const prepayment = computed(() => latest('PREPAYMENT'));
/** QPay invoices only exist once the contract is signed (1C-12 guards this too). */
const contractSigned = computed(() =>
  Boolean(gksCase.value?.contract && ['SIGNED', 'ACTIVE', 'COMPLETED'].includes(gksCase.value.contract.status)));
const balance = computed(() => latest('BALANCE'));
const pendingPayment = computed(() => payments.value.find((p) => p.status === 'PENDING'));

const creating = ref<PaymentKind | null>(null);
async function create(kind: PaymentKind) {
  if (!gksCase.value) return;
  errorMsg.value = null;
  creating.value = kind;
  try {
    const payment = await api.post<PaymentItem>(`/cases/${gksCase.value.id}/payments`, { kind });
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
let pollTimer: ReturnType<typeof setTimeout> | undefined;
/** Bumped on every (re)start, so a tick from a superseded run does nothing. */
let pollRun = 0;

function stopPolling(): void {
  pollRun += 1;
  clearTimeout(pollTimer);
  pollTimer = undefined;
}

watch(pendingPayment, (payment) => {
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
    pollTimer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  };

  pollTimer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
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
          </div>
        </template>
        <DsButton v-else :loading="creating === 'PREPAYMENT'" @click="create('PREPAYMENT')">Урьдчилгаа төлөх</DsButton>
      </DsCard>

      <DsCard v-if="prepayment?.status === 'PAID'" title="Үлдэгдэл">
        <template v-if="balance">
          <p class="gks-payment__amount gks-tnum">{{ formatMntOrDash(balance.amountMnt) }}</p>
          <DsBadge :tone="balance.status === 'PAID' ? 'success' : 'warning'">{{ PAYMENT_STATUS_LABELS[balance.status] }}</DsBadge>
          <div v-if="balance.status === 'PENDING'" class="gks-payment__qr">
            <img v-if="balance.qrImage" :src="`data:image/png;base64,${balance.qrImage}`" alt="QPay QR" class="gks-payment__qr-img">
            <p v-else class="gks-payment__qr-text gks-tnum">{{ balance.qrText }}</p>
          </div>
        </template>
        <DsButton v-else :loading="creating === 'BALANCE'" @click="create('BALANCE')">Үлдэгдэл төлөх</DsButton>
        <p v-if="!balance" class="gks-payment__hint">Таны үйлчилгээ зохих шатандаа хүрээгүй бол алдаа гарч болно.</p>
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
