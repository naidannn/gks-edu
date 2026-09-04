<script setup lang="ts">
import type { CaseDetail, PaymentItem, PaymentKind } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/** Prepayment/balance invoice creation + QPay QR + status polling (1C-17). */
definePageMeta({ middleware: 'auth' });

const { gksCase, reload } = inject('caseDetail') as { gksCase: Ref<CaseDetail | null>; reload: () => Promise<void> };
const api = useApi();
const errorMsg = ref<string | null>(null);

const payments = computed(() => gksCase.value?.payments ?? []);
function latest(kind: PaymentKind): PaymentItem | undefined {
  return payments.value.filter((p) => p.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
const prepayment = computed(() => latest('PREPAYMENT'));
const balance = computed(() => latest('BALANCE'));
const pendingPayment = computed(() => payments.value.find((p) => p.status === 'PENDING'));

const creating = ref<PaymentKind | null>(null);
async function create(kind: PaymentKind) {
  if (!gksCase.value) return;
  errorMsg.value = null;
  creating.value = kind;
  try {
    await api.post(`/cases/${gksCase.value.id}/payments`, { kind });
    await reload();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Төлбөр үүсгэж чадсангүй';
  } finally {
    creating.value = null;
  }
}

// Poll while a payment is PENDING — the same webhook/BullMQ-backed status the backend maintains.
let pollTimer: ReturnType<typeof setInterval> | undefined;
watch(pendingPayment, (payment) => {
  clearInterval(pollTimer);
  if (!payment) return;
  pollTimer = setInterval(async () => {
    const fresh = await api.get<{ status: string }>(`/payments/${payment.id}`);
    if (fresh.status !== 'PENDING') await reload();
  }, 3000);
}, { immediate: true });
onBeforeUnmount(() => clearInterval(pollTimer));

function mnt(value: string): string { return formatMnt(Number(value)) ?? '—'; }
</script>

<template>
  <div class="gks-payment">
    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>

    <DsCard v-if="!gksCase?.contract" title="Төлбөр">
      <p class="gks-payment__unknown">Гэрээ байгуулагдсаны дараа төлбөр төлөх боломжтой болно.</p>
    </DsCard>

    <template v-else>
      <DsCard title="Урьдчилгаа">
        <template v-if="prepayment">
          <p class="gks-payment__amount gks-tnum">{{ mnt(prepayment.amountMnt) }}</p>
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
          <p class="gks-payment__amount gks-tnum">{{ mnt(balance.amountMnt) }}</p>
          <DsBadge :tone="balance.status === 'PAID' ? 'success' : 'warning'">{{ PAYMENT_STATUS_LABELS[balance.status] }}</DsBadge>
          <div v-if="balance.status === 'PENDING'" class="gks-payment__qr">
            <img v-if="balance.qrImage" :src="`data:image/png;base64,${balance.qrImage}`" alt="QPay QR" class="gks-payment__qr-img">
            <p v-else class="gks-payment__qr-text gks-tnum">{{ balance.qrText }}</p>
          </div>
        </template>
        <DsButton v-else :loading="creating === 'BALANCE'" @click="create('BALANCE')">Үлдэгдэл төлөх</DsButton>
        <p v-if="!balance" class="gks-payment__hint">Таны хэрэг зохих шатандаа хүрээгүй бол алдаа гарч болно.</p>
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
</style>
