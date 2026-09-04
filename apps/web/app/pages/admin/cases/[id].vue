<script setup lang="ts">
import type { CaseDetail, CaseStage, ContractType, PaymentKind } from '@gks/shared';
import { ApiError } from '~/composables/useApi';

/** Staff case detail: contract issuance/signing, payments, transitions (1C-18). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const api = useApi();
const id = computed(() => String(route.params.id));

const gksCase = ref<CaseDetail | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    gksCase.value = await api.get<CaseDetail>(`/cases/${id.value}`);
  } catch {
    errorMsg.value = 'Хэргийг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

function reportError(err: unknown, fallback: string) {
  errorMsg.value = err instanceof ApiError ? err.message : fallback;
}

// --- Stage transition ---
const ALL_STAGES = Object.keys(CASE_STAGE_LABELS) as CaseStage[];
const transitionTarget = ref<CaseStage | ''>('');
const transitionReason = ref('');
const transitionPending = ref(false);

async function submitTransition() {
  if (!transitionTarget.value) return;
  errorMsg.value = null;
  transitionPending.value = true;
  try {
    await api.post(`/cases/${id.value}/transitions`, { toStage: transitionTarget.value, reason: transitionReason.value || undefined });
    transitionTarget.value = '';
    transitionReason.value = '';
    await load();
  } catch (err) {
    reportError(err, 'Шилжилт амжилтгүй боллоо');
  } finally {
    transitionPending.value = false;
  }
}

// --- Contract ---
const creatingContract = ref(false);
async function createContract(type: ContractType) {
  creatingContract.value = true;
  errorMsg.value = null;
  try {
    await api.post('/contracts', { caseId: id.value, type });
    await load();
  } catch (err) {
    reportError(err, 'Гэрээ үүсгэж чадсангүй');
  } finally {
    creatingContract.value = false;
  }
}

const downloadingPdf = ref(false);
async function downloadPdf(contractId: string) {
  downloadingPdf.value = true;
  try {
    const { downloadUrl } = await api.get<{ downloadUrl: string }>(`/contracts/${contractId}/pdf`);
    const config = useRuntimeConfig();
    const base = String(config.public.apiBase).replace(/\/api\/v1$/, '');
    window.open(`${base}${downloadUrl}`, '_blank');
  } catch (err) {
    reportError(err, 'PDF татаж чадсангүй');
  } finally {
    downloadingPdf.value = false;
  }
}

// Physical contract registration
const physicalSignedAt = ref('');
const physicalFile = ref<File | null>(null);
const registeringPhysical = ref(false);
function onPhysicalFileChange(e: Event) {
  physicalFile.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}
async function registerPhysical(contractId: string) {
  if (!physicalSignedAt.value || !physicalFile.value) return;
  registeringPhysical.value = true;
  errorMsg.value = null;
  try {
    const form = new FormData();
    form.append('signedAt', new Date(physicalSignedAt.value).toISOString());
    form.append('file', physicalFile.value);
    await api.post(`/contracts/${contractId}/physical`, form);
    await load();
  } catch (err) {
    reportError(err, 'Биет гэрээ бүртгэж чадсангүй');
  } finally {
    registeringPhysical.value = false;
  }
}

// Collateral contract (language prep only)
const collateralSigned = ref(false);
const collateralStart = ref('');
const collateralEnd = ref('');
const collateralFile = ref<File | null>(null);
const savingCollateral = ref(false);
watch(gksCase, (value) => {
  const c = value?.contract?.collateralContract;
  collateralSigned.value = c?.isSigned ?? false;
  collateralStart.value = c?.startDate?.slice(0, 10) ?? '';
  collateralEnd.value = c?.endDate?.slice(0, 10) ?? '';
}, { immediate: true });
function onCollateralFileChange(e: Event) {
  collateralFile.value = (e.target as HTMLInputElement).files?.[0] ?? null;
}
async function saveCollateral(contractId: string) {
  savingCollateral.value = true;
  errorMsg.value = null;
  try {
    const form = new FormData();
    form.append('isSigned', String(collateralSigned.value));
    if (collateralStart.value) form.append('startDate', new Date(collateralStart.value).toISOString());
    if (collateralEnd.value) form.append('endDate', new Date(collateralEnd.value).toISOString());
    if (collateralFile.value) form.append('file', collateralFile.value);
    await api.put(`/contracts/${contractId}/collateral`, form);
    await load();
  } catch (err) {
    reportError(err, 'Барьцааны гэрээ хадгалж чадсангүй');
  } finally {
    savingCollateral.value = false;
  }
}

// --- Payments ---
const creatingPayment = ref<PaymentKind | null>(null);
async function createPayment(kind: PaymentKind) {
  creatingPayment.value = kind;
  errorMsg.value = null;
  try {
    await api.post(`/cases/${id.value}/payments`, { kind });
    await load();
  } catch (err) {
    reportError(err, 'Төлбөр үүсгэж чадсангүй');
  } finally {
    creatingPayment.value = null;
  }
}

const actingOnPaymentId = ref<string | null>(null);
async function markPaidDev(paymentId: string) {
  actingOnPaymentId.value = paymentId;
  errorMsg.value = null;
  try {
    await api.post(`/payments/${paymentId}/dev-mark-paid`);
    await load();
  } catch (err) {
    reportError(err, 'Төлбөрийг баталгаажуулж чадсангүй');
  } finally {
    actingOnPaymentId.value = null;
  }
}
async function refundPayment(paymentId: string) {
  actingOnPaymentId.value = paymentId;
  errorMsg.value = null;
  try {
    await api.post(`/payments/${paymentId}/refund`);
    await load();
  } catch (err) {
    reportError(err, 'Буцаалт хийж чадсангүй');
  } finally {
    actingOnPaymentId.value = null;
  }
}

function stageTone(s: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'COMPLETED') return 'success';
  if (['CANCELLED', 'REJECTED'].includes(s)) return 'danger';
  if (s === 'ON_HOLD') return 'warning';
  if (s === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}
function paymentTone(s: string): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'PAID' || s === 'REFUNDED') return 'success';
  if (s === 'PENDING') return 'warning';
  if (s === 'FAILED' || s === 'EXPIRED') return 'danger';
  return 'neutral';
}
function mnt(value: string | number): string {
  return formatMnt(Number(value)) ?? '—';
}
function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

useHead({ title: () => (gksCase.value ? gksCase.value.code : 'Хэрэг') });
</script>

<template>
  <div class="gks-case">
    <NuxtLink to="/admin/cases" class="gks-case__back"><DsIcon name="arrow-left" :size="16" /> Хэрэг</NuxtLink>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>
    <div v-if="pending && !gksCase" class="gks-case__skeleton" />

    <template v-else-if="gksCase">
      <header class="gks-case__head">
        <div>
          <h1 class="gks-case__title">{{ gksCase.code }}</h1>
          <div class="gks-case__tags">
            <DsBadge :tone="stageTone(gksCase.stage)">{{ CASE_STAGE_LABELS[gksCase.stage] }}</DsBadge>
            <DsBadge tone="neutral">{{ SERVICE_LABELS[gksCase.serviceType] }}</DsBadge>
          </div>
        </div>
        <p class="gks-case__user">{{ gksCase.user.name ?? gksCase.user.email }} · {{ gksCase.user.email }}</p>
      </header>

      <div class="gks-case__grid">
        <div class="gks-case__main">
          <!-- Stage transition -->
          <DsCard title="Үе шат шилжүүлэх">
            <div class="gks-case__transition">
              <DsSelect
                v-model="transitionTarget"
                :options="[{ value: '', label: 'Шилжих үе шат сонгох' }, ...ALL_STAGES.filter((s) => s !== gksCase!.stage).map((s) => ({ value: s, label: CASE_STAGE_LABELS[s] }))]"
              />
              <DsInput v-model="transitionReason" label="Шалтгаан (заавал биш)" />
              <DsButton :disabled="!transitionTarget" :loading="transitionPending" @click="submitTransition">Шилжүүлэх</DsButton>
              <p class="gks-case__hint">Системийн шилжилтийг (төлбөр/гэрээ баталгаажсанаар) энд гараар хийх боломжгүй.</p>
            </div>
          </DsCard>

          <!-- Contract -->
          <DsCard title="Гэрээ">
            <div v-if="!gksCase.contract" class="gks-case__contract-actions">
              <DsButton :loading="creatingContract" @click="createContract('ELECTRONIC')">Цахим гэрээ үүсгэх</DsButton>
              <DsButton variant="secondary" :loading="creatingContract" @click="createContract('PHYSICAL')">Биет гэрээ үүсгэх</DsButton>
            </div>
            <template v-else>
              <dl class="gks-case__facts">
                <CommonDataValue label="Төрөл" :value="CONTRACT_TYPE_LABELS[gksCase.contract.type]" />
                <CommonDataValue label="Төлөв" :value="CONTRACT_STATUS_LABELS[gksCase.contract.status]" />
                <CommonDataValue label="Нийт төлбөр" :value="mnt(gksCase.contract.totalAmountSnapshot)" />
                <CommonDataValue label="Урьдчилгаа" :value="mnt(gksCase.contract.prepaymentValueSnapshot)" />
                <CommonDataValue label="Гарын үсэг зурсан" :value="formatDateTime(gksCase.contract.signedAt)" />
              </dl>

              <DsButton v-if="gksCase.contract.pdfPath" size="sm" variant="secondary" :loading="downloadingPdf" @click="downloadPdf(gksCase.contract.id)">
                PDF татах
              </DsButton>

              <!-- Physical registration -->
              <div v-if="gksCase.contract.type === 'PHYSICAL' && gksCase.contract.status !== 'SIGNED' && gksCase.contract.status !== 'ACTIVE'" class="gks-case__subform">
                <h3 class="gks-case__subtitle">Биет гэрээ бүртгэх</h3>
                <DsInput v-model="physicalSignedAt" type="date" label="Гарын үсэг зурсан огноо" />
                <input type="file" accept="application/pdf,image/jpeg,image/png" @change="onPhysicalFileChange">
                <DsButton size="sm" :disabled="!physicalSignedAt || !physicalFile" :loading="registeringPhysical" @click="registerPhysical(gksCase.contract.id)">
                  Бүртгэх
                </DsButton>
              </div>

              <!-- Collateral contract (language prep only) -->
              <div v-if="gksCase.serviceType === 'LANGUAGE_PREP'" class="gks-case__subform">
                <h3 class="gks-case__subtitle">Барьцааны гэрээ</h3>
                <label class="gks-case__checkbox"><input v-model="collateralSigned" type="checkbox"> Байгуулагдсан</label>
                <DsInput v-model="collateralStart" type="date" label="Эхлэх огноо" />
                <DsInput v-model="collateralEnd" type="date" label="Дуусах огноо" />
                <input type="file" accept="application/pdf,image/jpeg,image/png" @change="onCollateralFileChange">
                <DsButton size="sm" :loading="savingCollateral" @click="saveCollateral(gksCase.contract.id)">Хадгалах</DsButton>
              </div>
            </template>
          </DsCard>

          <!-- Payments -->
          <DsCard title="Төлбөр">
            <div class="gks-case__contract-actions">
              <DsButton size="sm" :loading="creatingPayment === 'PREPAYMENT'" @click="createPayment('PREPAYMENT')">Урьдчилгаа нэхэмжлэх</DsButton>
              <DsButton size="sm" variant="secondary" :loading="creatingPayment === 'BALANCE'" @click="createPayment('BALANCE')">Үлдэгдэл нэхэмжлэх</DsButton>
            </div>

            <table v-if="gksCase.payments.length" class="gks-table">
              <thead>
                <tr><th>Төрөл</th><th>Дүн</th><th>Төлөв</th><th>Огноо</th><th /></tr>
              </thead>
              <tbody>
                <tr v-for="p in gksCase.payments" :key="p.id">
                  <td>{{ PAYMENT_KIND_LABELS[p.kind] }}</td>
                  <td class="gks-tnum">{{ mnt(p.amountMnt) }}</td>
                  <td><DsBadge :tone="paymentTone(p.status)">{{ PAYMENT_STATUS_LABELS[p.status] }}</DsBadge></td>
                  <td class="gks-tnum">{{ formatDateTime(p.paidAt ?? p.createdAt) }}</td>
                  <td class="gks-case__payment-actions">
                    <DsButton
                      v-if="p.status === 'PENDING'"
                      size="sm"
                      variant="ghost"
                      :loading="actingOnPaymentId === p.id"
                      @click="markPaidDev(p.id)"
                    >
                      Төлөгдсөн (dev)
                    </DsButton>
                    <DsButton
                      v-if="p.status === 'PAID' && p.kind !== 'REFUND'"
                      size="sm"
                      variant="ghost"
                      :loading="actingOnPaymentId === p.id"
                      @click="refundPayment(p.id)"
                    >
                      Буцаах
                    </DsButton>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="gks-case__unknown">Төлбөр хараахан үүсээгүй байна.</p>
          </DsCard>
        </div>

        <aside class="gks-case__side">
          <DsCard title="Хариуцагч">
            <dl class="gks-case__facts">
              <CommonDataValue label="Зөвлөх" :value="gksCase.assignedConsultant?.name" />
              <CommonDataValue label="Баримт хариуцагч" :value="gksCase.assignedDocOfficer?.name" />
            </dl>
          </DsCard>

          <DsCard title="Түүх">
            <ol class="gks-timeline">
              <li v-for="t in gksCase.transitions" :key="t.id" class="gks-timeline__item">
                <div class="gks-timeline__head">
                  <span class="gks-timeline__stage">{{ CASE_STAGE_LABELS[t.fromStage] }} → {{ CASE_STAGE_LABELS[t.toStage] }}</span>
                </div>
                <p class="gks-timeline__actor">{{ formatDateTime(t.createdAt) }} — {{ t.actor?.name ?? 'Систем' }}</p>
              </li>
            </ol>
            <p v-if="!gksCase.transitions.length" class="gks-case__unknown">Түүх алга байна.</p>
          </DsCard>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.gks-case { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-case__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-case__back:hover { color: var(--brand-600); }
.gks-case__skeleton { height: 400px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }

.gks-case__head { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: var(--sp-4); }
.gks-case__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-case__tags { display: flex; gap: var(--sp-2); margin-top: var(--sp-2); }
.gks-case__user { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-case__grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--sp-5); align-items: start; }
.gks-case__main { display: flex; flex-direction: column; gap: var(--sp-5); min-width: 0; }
.gks-case__side { display: flex; flex-direction: column; gap: var(--sp-5); }

.gks-case__transition { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-case__hint { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-case__contract-actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-3); }
.gks-case__facts { display: flex; flex-direction: column; gap: var(--sp-1); margin-bottom: var(--sp-3); }
.gks-case__subform { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-case__subtitle { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-case__checkbox { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-case__unknown { color: var(--text-subtle); font-style: italic; }
.gks-case__payment-actions { display: flex; gap: var(--sp-2); }

.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); }
.gks-table th { text-align: left; padding: var(--sp-2) var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-table td { padding: var(--sp-2) var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }

.gks-timeline { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-timeline__item { padding-bottom: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-timeline__item:last-child { border-bottom: 0; padding-bottom: 0; }
.gks-timeline__stage { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.gks-timeline__actor { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }

@media (max-width: 900px) {
  .gks-case__grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
