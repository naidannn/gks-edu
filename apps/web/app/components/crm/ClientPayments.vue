<script setup lang="ts">
import type { ContractType, PaymentItem, PaymentKind, PaymentMethod, WorkspaceCase } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/**
 * Payments tab (1G-17) — the money side of one case in one place: the contract
 * it rests on, what has been invoiced, what is outstanding, and the actions
 * that move either.
 *
 * Every call here is the one `/admin/cases/:id` already made (1C-18); the
 * pricing, the QPay invoice and the signature flow are untouched.
 */
const props = defineProps<{ workspaceCase: WorkspaceCase }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();
const config = useRuntimeConfig();

const busy = ref(false);
const errorMsg = ref<string | null>(null);
const showBody = ref(false);

const contract = computed(() => props.workspaceCase.contract);
const payments = computed(() => props.workspaceCase.payments);

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  errorMsg.value = null;
  try {
    await action();
    emit('changed');
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

// ── Contract (1C-18) ───────────────────────────────────────────────────────
function createContract(type: ContractType) {
  return act(() => api.post('/contracts', { caseId: props.workspaceCase.id, type }));
}

async function downloadPdf(contractId: string) {
  await act(async () => {
    const { downloadUrl } = await api.get<{ downloadUrl: string }>(`/contracts/${contractId}/pdf`);
    const base = String(config.public.apiBase).replace(/\/api\/v1$/, '');
    window.open(`${base}${downloadUrl}`, '_blank');
  });
}

/**
 * A paper contract is signed with a pen, so the sheet has to leave the system
 * before anything can be scanned back into it (1C-25). The PDF is rendered on
 * demand and never stored, so it is fetched with the bearer token and opened
 * from a blob rather than through a signed storage link.
 */
async function printContract(contractId: string) {
  await act(async () => {
    const blob = await api.get<Blob>(`/contracts/${contractId}/print`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, '_blank');
    if (!tab) {
      // Popup blocked — hand the file over as a download instead of failing silently.
      const link = document.createElement('a');
      link.href = url;
      link.download = `Гэрээ-${contract.value?.number.replace(/\//g, '-') ?? contractId}.pdf`;
      link.click();
    }
    // The new tab still needs the blob to render; revoking it now would blank the page.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

const physicalSignedAt = ref('');
const physicalFile = ref<File | null>(null);
function registerPhysical(contractId: string) {
  if (!physicalSignedAt.value || !physicalFile.value) return;
  const body = new FormData();
  body.append('signedAt', new Date(physicalSignedAt.value).toISOString());
  body.append('file', physicalFile.value);
  return act(() => api.post(`/contracts/${contractId}/physical`, body));
}

// Collateral contract — language prep only, metadata never priced (§5.4).
const collateral = reactive({ isSigned: false, startDate: '', endDate: '' });
const collateralFile = ref<File | null>(null);
watch(
  () => props.workspaceCase.contract?.collateralContract,
  (row) => {
    collateral.isSigned = row?.isSigned ?? false;
    collateral.startDate = row?.startDate?.slice(0, 10) ?? '';
    collateral.endDate = row?.endDate?.slice(0, 10) ?? '';
  },
  { immediate: true },
);
function saveCollateral(contractId: string) {
  const body = new FormData();
  body.append('isSigned', String(collateral.isSigned));
  if (collateral.startDate) body.append('startDate', new Date(collateral.startDate).toISOString());
  if (collateral.endDate) body.append('endDate', new Date(collateral.endDate).toISOString());
  if (collateralFile.value) body.append('file', collateralFile.value);
  return act(() => api.put(`/contracts/${contractId}/collateral`, body));
}

// ── Payments ───────────────────────────────────────────────────────────────
function invoice(kind: PaymentKind) {
  return act(() => api.post(`/cases/${props.workspaceCase.id}/payments`, { kind }));
}
function markPaid(paymentId: string) {
  return act(() => api.post(`/payments/${paymentId}/dev-mark-paid`));
}

/**
 * Money that arrived outside QPay (1C-27). The amount is not asked for: it comes
 * from the contract snapshot on the server, so a typo at the desk cannot leave
 * the case owing a figure nobody agreed to.
 */
const MANUAL_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = ['BANK_TRANSFER', 'CARD', 'CASH'].map(
  (value) => ({ value: value as PaymentMethod, label: PAYMENT_METHOD_LABELS[value as PaymentMethod] }),
);

const manualOpen = ref(false);
const manual = reactive({
  kind: 'PREPAYMENT' as PaymentKind,
  method: 'BANK_TRANSFER' as PaymentMethod,
  paidAt: new Date().toISOString().slice(0, 10),
  reference: '',
  note: '',
});
const manualReceipt = ref<File | null>(null);
const manualReceiptInput = ref<HTMLInputElement | null>(null);

/** Only the kinds still unpaid — the form must not offer to re-collect the prepayment. */
const manualKindOptions = computed(() =>
  (['PREPAYMENT', 'BALANCE'] as PaymentKind[])
    .filter((kind) => !payments.value.some((row) => row.kind === kind && row.status === 'PAID'))
    .map((kind) => ({ value: kind, label: PAYMENT_KIND_LABELS[kind] })),
);

watch(manualKindOptions, (options) => {
  if (options.length && !options.some((o) => o.value === manual.kind)) manual.kind = options[0]!.value;
}, { immediate: true });

async function registerManual() {
  const body = new FormData();
  body.append('kind', manual.kind);
  body.append('method', manual.method);
  body.append('paidAt', new Date(manual.paidAt).toISOString());
  if (manual.reference.trim()) body.append('reference', manual.reference.trim());
  if (manual.note.trim()) body.append('note', manual.note.trim());
  if (manualReceipt.value) body.append('receipt', manualReceipt.value);

  await act(() => api.post(`/cases/${props.workspaceCase.id}/payments/manual`, body));
  if (errorMsg.value) return;

  manualOpen.value = false;
  manual.reference = '';
  manual.note = '';
  manualReceipt.value = null;
  if (manualReceiptInput.value) manualReceiptInput.value.value = '';
}

async function openReceipt(paymentId: string) {
  await act(async () => {
    const signed = await api.get<{ token: string }>(`/payments/${paymentId}/receipt-url`);
    window.open(`${config.public.apiBase}/files/${signed.token}`, '_blank', 'noopener');
  });
}

/** The channel plus whatever identifies the transaction, on one line. */
function methodDetail(payment: PaymentItem): string {
  const label = PAYMENT_METHOD_LABELS[payment.method];
  return payment.reference ? `${label} · ${payment.reference}` : label;
}
function refund(paymentId: string) {
  return act(() => api.post(`/payments/${paymentId}/refund`));
}

// ── Money summary ──────────────────────────────────────────────────────────
const totals = computed(() => {
  const paid = payments.value
    .filter((row) => row.status === 'PAID' && row.kind !== 'REFUND')
    .reduce((sum, row) => sum + Number(row.amountMnt), 0);
  const refunded = payments.value
    .filter((row) => row.kind === 'REFUND')
    .reduce((sum, row) => sum + Number(row.amountMnt), 0);
  const pending = payments.value
    .filter((row) => row.status === 'PENDING')
    .reduce((sum, row) => sum + Number(row.amountMnt), 0);
  const total = Number(contract.value?.totalAmountSnapshot ?? 0);
  return { total, paid, refunded, pending, remaining: Math.max(0, total - paid) };
});

function mnt(value: string | number): string {
  return formatMntAmount(value) ?? '—';
}
function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * A QPay payment happened at a moment we recorded, so it is shown to the
 * minute. A manual registration is a *date* somebody typed — stored as UTC
 * midnight, and so read back in UTC. Formatting it locally would print an
 * 08:00 nobody entered, and west of UTC it would print the day before.
 */
function formatPaymentDate(payment: PaymentItem): string {
  if (payment.method === 'QPAY' || !payment.paidAt) return formatDateTime(payment.paidAt ?? payment.createdAt);
  const date = new Date(payment.paidAt);
  return date.toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const needsPhysicalRegistration = computed(
  () =>
    contract.value?.type === 'PHYSICAL'
    && contract.value.status !== 'SIGNED'
    && contract.value.status !== 'ACTIVE',
);
</script>

<template>
  <div class="gks-cpay">
    <DsCard v-if="errorMsg" accent><p class="gks-cpay__error">{{ errorMsg }}</p></DsCard>

    <!-- The financial position, before any of the machinery below it. -->
    <div class="gks-cpay__totals">
      <DsCard class="gks-cpay__tile">
        <p class="gks-cpay__tile-label">Гэрээний дүн</p>
        <p class="gks-cpay__tile-value gks-tnum">{{ totals.total ? mnt(totals.total) : '—' }}</p>
      </DsCard>
      <DsCard class="gks-cpay__tile">
        <p class="gks-cpay__tile-label">Төлөгдсөн</p>
        <p class="gks-cpay__tile-value gks-tnum">{{ mnt(totals.paid) }}</p>
      </DsCard>
      <DsCard class="gks-cpay__tile" :accent="totals.pending > 0">
        <p class="gks-cpay__tile-label">Хүлээгдэж буй</p>
        <p class="gks-cpay__tile-value gks-tnum">{{ mnt(totals.pending) }}</p>
      </DsCard>
      <DsCard class="gks-cpay__tile">
        <p class="gks-cpay__tile-label">Үлдэгдэл</p>
        <p class="gks-cpay__tile-value gks-tnum">{{ totals.total ? mnt(totals.remaining) : '—' }}</p>
      </DsCard>
    </div>

    <DsCard title="Гэрээ">
      <div v-if="!contract" class="gks-cpay__actions">
        <p class="gks-cpay__muted">Энэ үйлчилгээнд гэрээ үүсээгүй байна.</p>
        <div class="gks-cpay__buttons">
          <DsButton :loading="busy" @click="createContract('ELECTRONIC')">Цахим гэрээ үүсгэх</DsButton>
          <DsButton variant="secondary" :loading="busy" @click="createContract('PHYSICAL')">Биет гэрээ үүсгэх</DsButton>
        </div>
      </div>

      <template v-else>
        <dl class="gks-cpay__facts">
          <CommonDataValue label="Дугаар" :value="contract.number" />
          <CommonDataValue label="Төрөл" :value="CONTRACT_TYPE_LABELS[contract.type]" />
          <CommonDataValue label="Төлөв" :value="CONTRACT_STATUS_LABELS[contract.status]" />
          <CommonDataValue label="Нийт төлбөр" :value="mnt(contract.totalAmountSnapshot)" />
          <CommonDataValue label="Урьдчилгаа" :value="mnt(contract.prepaymentValueSnapshot)" />
          <CommonDataValue label="Үлдэгдлийн нөхцөл" :value="BALANCE_TRIGGER_LABELS[contract.balanceTriggerSnapshot]" />
          <CommonDataValue label="Гарын үсэг зурсан" :value="formatDateTime(contract.signedAt)" />
        </dl>

        <div class="gks-cpay__row">
          <DsButton
            v-if="contract.pdfPath"
            size="sm"
            variant="secondary"
            icon-left="download"
            :loading="busy"
            @click="downloadPdf(contract.id)"
          >
            PDF татах
          </DsButton>
          <DsButton
            size="sm"
            variant="secondary"
            icon-left="printer"
            :loading="busy"
            @click="printContract(contract.id)"
          >
            Хэвлэх
          </DsButton>
          <DsButton size="sm" variant="ghost" @click="showBody = !showBody">
            {{ showBody ? 'Эхийг хаах' : 'Гэрээний эх харах' }}
          </DsButton>
        </div>

        <div v-if="showBody" class="gks-cpay__sheet">
          <ContractDocument :body="contract.bodyMn" :number="contract.number" :date="contract.createdAt" />
        </div>

        <div v-if="needsPhysicalRegistration" class="gks-cpay__subform">
          <h3 class="gks-cpay__subtitle">Биет гэрээ бүртгэх</h3>
          <p class="gks-cpay__muted">Гэрээг хэвлэж, талууд гарын үсэг зурсны дараа сканыг нь эндээс хавсаргана.</p>
          <DsInput v-model="physicalSignedAt" type="date" label="Гарын үсэг зурсан огноо" />
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            @change="physicalFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
          >
          <DsButton
            size="sm"
            :disabled="!physicalSignedAt || !physicalFile"
            :loading="busy"
            @click="registerPhysical(contract.id)"
          >
            Бүртгэх
          </DsButton>
        </div>

        <!-- Collateral is metadata only — never priced, never automated (§5.4). -->
        <div v-if="workspaceCase.serviceType === 'LANGUAGE_PREP'" class="gks-cpay__subform">
          <h3 class="gks-cpay__subtitle">Барьцааны гэрээ</h3>
          <label class="gks-cpay__checkbox">
            <input v-model="collateral.isSigned" type="checkbox"> Байгуулагдсан
          </label>
          <DsInput v-model="collateral.startDate" type="date" label="Эхлэх огноо" />
          <DsInput v-model="collateral.endDate" type="date" label="Дуусах огноо" />
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            @change="collateralFile = ($event.target as HTMLInputElement).files?.[0] ?? null"
          >
          <DsButton size="sm" :loading="busy" @click="saveCollateral(contract.id)">Хадгалах</DsButton>
        </div>
      </template>
    </DsCard>

    <DsCard title="Төлбөр">
      <template #action>
        <NuxtLink to="/admin/payments" class="gks-cpay__link">Бүх төлбөр →</NuxtLink>
      </template>

      <div class="gks-cpay__buttons">
        <DsButton size="sm" :loading="busy" @click="invoice('PREPAYMENT')">Урьдчилгаа нэхэмжлэх</DsButton>
        <DsButton size="sm" variant="secondary" :loading="busy" @click="invoice('BALANCE')">Үлдэгдэл нэхэмжлэх</DsButton>
        <DsButton
          v-if="manualKindOptions.length"
          size="sm"
          variant="ghost"
          icon-left="plus"
          @click="manualOpen = !manualOpen"
        >
          {{ manualOpen ? 'Болих' : 'Гараар бүртгэх' }}
        </DsButton>
      </div>

      <!-- QPay-аас гадуур ирсэн төлбөр: данс, карт, бэлэн мөнгө (1C-27). -->
      <div v-if="manualOpen && manualKindOptions.length" class="gks-cpay__subform gks-cpay__subform--flush">
        <h3 class="gks-cpay__subtitle">QPay-аас гадуур төлсөн төлбөр бүртгэх</h3>
        <p class="gks-cpay__muted">
          Дүнг гэрээнээс автоматаар авна. Бүртгэсний дараа үйлчилгээний явц урагшилж, харилцагчид мэдэгдэл очно.
        </p>
        <div class="gks-cpay__grid">
          <DsSelect v-model="manual.kind" label="Төлбөрийн төрөл" :options="manualKindOptions" />
          <DsSelect v-model="manual.method" label="Төлсөн суваг" :options="MANUAL_METHOD_OPTIONS" />
          <DsInput v-model="manual.paidAt" type="date" label="Мөнгө орсон огноо" :max="new Date().toISOString().slice(0, 10)" />
          <DsInput v-model="manual.reference" label="Гүйлгээний дугаар" placeholder="Дансны гүйлгээ / баримтын дугаар" />
        </div>
        <DsTextarea v-model="manual.note" label="Тэмдэглэл" :rows="2" placeholder="Хэн, аль данснаас төлсөн г.м." />
        <label class="gks-cpay__file">
          <span class="gks-cpay__muted">Баримт (заавал биш) — PDF, JPG, PNG</span>
          <input
            ref="manualReceiptInput"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            @change="manualReceipt = ($event.target as HTMLInputElement).files?.[0] ?? null"
          >
        </label>
        <DsButton size="sm" :disabled="!manual.paidAt" :loading="busy" @click="registerManual()">Төлбөр бүртгэх</DsButton>
      </div>

      <div v-if="payments.length" class="gks-cpay__table-wrap">
        <table class="gks-table">
          <thead>
            <tr><th>Төрөл</th><th>Суваг</th><th>Дүн</th><th>Төлөв</th><th>Огноо</th><th /></tr>
          </thead>
          <tbody>
            <tr v-for="payment in payments" :key="payment.id">
              <td>{{ PAYMENT_KIND_LABELS[payment.kind] }}</td>
              <td :title="payment.note ?? undefined">{{ methodDetail(payment) }}</td>
              <td class="gks-tnum">{{ mnt(payment.amountMnt) }}</td>
              <td><DsBadge :tone="PAYMENT_STATUS_TONE[payment.status]">{{ PAYMENT_STATUS_LABELS[payment.status] }}</DsBadge></td>
              <td class="gks-tnum">{{ formatPaymentDate(payment) }}</td>
              <td class="gks-cpay__row-actions">
                <DsButton
                  v-if="payment.status === 'PENDING'"
                  size="sm"
                  variant="ghost"
                  :loading="busy"
                  @click="markPaid(payment.id)"
                >
                  Төлөгдсөн (dev)
                </DsButton>
                <DsButton
                  v-if="payment.receiptPath"
                  size="sm"
                  variant="ghost"
                  icon-left="download"
                  :loading="busy"
                  @click="openReceipt(payment.id)"
                >
                  Баримт
                </DsButton>
                <DsButton
                  v-if="payment.status === 'PAID' && payment.kind !== 'REFUND'"
                  size="sm"
                  variant="ghost"
                  :loading="busy"
                  @click="refund(payment.id)"
                >
                  Буцаах
                </DsButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="gks-cpay__muted">Төлбөр хараахан үүсээгүй байна.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-cpay { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-cpay__row { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-cpay__sheet {
  margin-top: var(--sp-4);
  max-height: 520px;
  overflow-y: auto;
  border: 1px solid var(--line-hairline);
  border-radius: var(--radius-1);
}
.gks-cpay__error { color: var(--danger-fg); }

.gks-cpay__totals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-cpay__tile-label { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-cpay__tile-value { margin-top: var(--sp-1); font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }

.gks-cpay__facts { display: flex; flex-direction: column; gap: var(--sp-1); margin-bottom: var(--sp-3); }
.gks-cpay__actions { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-cpay__buttons { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.gks-cpay__subform { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-cpay__subtitle { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-cpay__checkbox { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-cpay__muted { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-cpay__subform--flush { align-items: flex-start; margin-top: 0; padding-top: 0; border-top: none; }
.gks-cpay__subform--flush > .gks-cpay__grid, .gks-cpay__subform--flush > .gks-field { align-self: stretch; }
.gks-cpay__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-3); }
.gks-cpay__file { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
.gks-cpay__link { font-size: var(--fs-caption); color: var(--brand-700); text-decoration: none; }

.gks-cpay__table-wrap { overflow-x: auto; }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-table th { text-align: left; padding: var(--sp-2) var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-cpay__row-actions { display: flex; gap: var(--sp-2); }

@media (max-width: 900px) {
  .gks-cpay__totals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
