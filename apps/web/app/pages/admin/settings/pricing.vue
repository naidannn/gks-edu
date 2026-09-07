<script setup lang="ts">
import type { BalanceTrigger, PrepaymentMode, ServiceType, ServicePricing } from '@gks/shared';

/** Service pricing + prepayment configuration (1C-19). */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const SERVICE_TYPES = Object.keys(SERVICE_LABELS) as ServiceType[];
const PREPAYMENT_MODES = Object.keys(PREPAYMENT_MODE_LABELS) as PrepaymentMode[];
const BALANCE_TRIGGERS = Object.keys(BALANCE_TRIGGER_LABELS) as BalanceTrigger[];

const api = useApi();
const rows = ref<ServicePricing[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    rows.value = await api.get<ServicePricing[]>('/pricing');
  } catch {
    errorMsg.value = 'Үнийн жагсаалтыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const activeByService = computed(() => {
  const map = new Map<ServiceType, ServicePricing>();
  for (const row of rows.value) if (!row.effectiveTo) map.set(row.serviceType, row);
  return map;
});
function historyFor(serviceType: ServiceType): ServicePricing[] {
  return rows.value.filter((r) => r.serviceType === serviceType && r.effectiveTo).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

const form = reactive({
  serviceType: 'LANGUAGE_PREP' as ServiceType,
  totalAmount: '',
  prepaymentMode: 'FIXED' as PrepaymentMode,
  prepaymentValue: '',
  balanceTrigger: 'AFTER_VISA_APPROVED' as BalanceTrigger,
});
const submitting = ref(false);

/**
 * Editing the active row, in place. Adding a version is how a *price change* is
 * recorded; this is the other case — a figure typed wrong, which was never in
 * force and should not survive in the history. Only the open row can be edited,
 * so a closed one stays the record of what we actually charged.
 */
const editingId = ref<string | null>(null);
const editError = ref<string | null>(null);
const savingEdit = ref(false);
const edit = reactive({
  totalAmount: '',
  prepaymentMode: 'FIXED' as PrepaymentMode,
  prepaymentValue: '',
  balanceTrigger: 'AFTER_VISA_APPROVED' as BalanceTrigger,
});

function startEdit(row: ServicePricing) {
  editingId.value = row.id;
  editError.value = null;
  edit.totalAmount = String(Number(row.totalAmount));
  edit.prepaymentMode = row.prepaymentMode;
  edit.prepaymentValue = String(Number(row.prepaymentValue));
  edit.balanceTrigger = row.balanceTrigger;
}

function cancelEdit() {
  editingId.value = null;
  editError.value = null;
}

async function saveEdit() {
  if (!editingId.value) return;
  editError.value = null;
  savingEdit.value = true;
  try {
    await api.patch(`/pricing/${editingId.value}`, {
      totalAmount: Number(edit.totalAmount),
      prepaymentMode: edit.prepaymentMode,
      prepaymentValue: Number(edit.prepaymentValue),
      balanceTrigger: edit.balanceTrigger,
    });
    editingId.value = null;
    await load();
  } catch (err) {
    editError.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    savingEdit.value = false;
  }
}

async function submit() {
  errorMsg.value = null;
  submitting.value = true;
  try {
    await api.post('/pricing', {
      serviceType: form.serviceType,
      totalAmount: Number(form.totalAmount),
      prepaymentMode: form.prepaymentMode,
      prepaymentValue: Number(form.prepaymentValue),
      balanceTrigger: form.balanceTrigger,
    });
    form.totalAmount = '';
    form.prepaymentValue = '';
    await load();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    submitting.value = false;
  }
}


useHead({ title: 'Үнийн тохиргоо · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Тохиргоо</span>
        <h1 class="gks-page__title">Үйлчилгээний үнэ, урьдчилгаа</h1>
      </div>
    </header>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>

    <DsCard title="Шинэ хувилбар нэмэх">
      <div class="gks-form-grid">
        <DsSelect v-model="form.serviceType" :options="SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))" label="Үйлчилгээ" />
        <DsInput v-model="form.totalAmount" type="number" label="Нийт төлбөр (₮)" />
        <DsSelect v-model="form.prepaymentMode" :options="PREPAYMENT_MODES.map((m) => ({ value: m, label: PREPAYMENT_MODE_LABELS[m] }))" label="Урьдчилгааны хэлбэр" />
        <DsInput v-model="form.prepaymentValue" type="number" :label="form.prepaymentMode === 'PERCENT' ? 'Урьдчилгаа (%)' : 'Урьдчилгаа (₮)'" />
        <DsSelect v-model="form.balanceTrigger" :options="BALANCE_TRIGGERS.map((t) => ({ value: t, label: BALANCE_TRIGGER_LABELS[t] }))" label="Үлдэгдэл төлөгдөх нөхцөл" />
        <DsButton :disabled="!form.totalAmount || !form.prepaymentValue" :loading="submitting" @click="submit">Хадгалах</DsButton>
      </div>
      <p class="gks-settings__hint">Шинэ хувилбар идэвхжихэд одоо идэвхтэй үнэ хаагдаж, дараагийн шинэ гэрээнд л нөлөөлнэ — хуучин гэрээ өөрчлөгдөхгүй.</p>
    </DsCard>

    <div v-if="pending && !rows.length" class="gks-skeleton__row gks-skeleton--page" />

    <DsCard v-for="s in SERVICE_TYPES" v-else :key="s" :title="SERVICE_LABELS[s]">
      <template v-if="activeByService.get(s) && editingId !== activeByService.get(s)!.id" #action>
        <DsButton variant="ghost" size="sm" icon-left="pencil" @click="startEdit(activeByService.get(s)!)">Засах</DsButton>
      </template>

      <template v-if="activeByService.get(s) && editingId === activeByService.get(s)!.id">
        <div class="gks-form-grid">
          <DsInput v-model="edit.totalAmount" type="number" label="Нийт төлбөр (₮)" />
          <DsSelect v-model="edit.prepaymentMode" :options="PREPAYMENT_MODES.map((m) => ({ value: m, label: PREPAYMENT_MODE_LABELS[m] }))" label="Урьдчилгааны хэлбэр" />
          <DsInput v-model="edit.prepaymentValue" type="number" :label="edit.prepaymentMode === 'PERCENT' ? 'Урьдчилгаа (%)' : 'Урьдчилгаа (₮)'" />
          <DsSelect v-model="edit.balanceTrigger" :options="BALANCE_TRIGGERS.map((t) => ({ value: t, label: BALANCE_TRIGGER_LABELS[t] }))" label="Үлдэгдэл төлөгдөх нөхцөл" />
        </div>
        <p v-if="editError" class="gks-settings__error">{{ editError }}</p>
        <div class="gks-form-actions">
          <DsButton :disabled="!edit.totalAmount || !edit.prepaymentValue" :loading="savingEdit" @click="saveEdit">Хадгалах</DsButton>
          <DsButton variant="ghost" :disabled="savingEdit" @click="cancelEdit">Болих</DsButton>
        </div>
        <p class="gks-settings__hint">Энэ засвар одоо мөрдөж буй хувилбарыг өөрчилнө — буруу бичсэн тоог залруулахад. Үнэ үнэхээр өөрчлөгдөж байгаа бол дээрээс шинэ хувилбар нэмнэ.</p>
      </template>

      <template v-else-if="activeByService.get(s)">
        <dl class="gks-settings__facts">
          <CommonDataValue label="Нийт төлбөр" :value="formatMntOrDash(activeByService.get(s)!.totalAmount)" />
          <CommonDataValue label="Урьдчилгаа" :value="activeByService.get(s)!.prepaymentMode === 'PERCENT' ? `${activeByService.get(s)!.prepaymentValue}%` : formatMntOrDash(activeByService.get(s)!.prepaymentValue)" />
          <CommonDataValue label="Үлдэгдэл нөхцөл" :value="BALANCE_TRIGGER_LABELS[activeByService.get(s)!.balanceTrigger]" />
        </dl>
        <details v-if="historyFor(s).length" class="gks-settings__history">
          <summary>Түүх ({{ historyFor(s).length }})</summary>
          <ul>
            <li v-for="h in historyFor(s)" :key="h.id" class="gks-tnum">
              {{ formatMntOrDash(h.totalAmount) }} · {{ formatNumericDate(h.effectiveFrom) }} – {{ formatNumericDate(h.effectiveTo) }}
            </li>
          </ul>
        </details>
      </template>
      <p v-else class="gks-settings__unknown">Идэвхтэй үнэ тохируулагдаагүй байна.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-settings__hint { margin-top: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-settings__error { margin-top: var(--sp-3); color: var(--red-700); font-size: var(--fs-body-sm); }
.gks-form-actions { margin-top: var(--sp-4); }
.gks-settings__facts { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-settings__unknown { color: var(--text-subtle); font-style: italic; }
.gks-settings__history { margin-top: var(--sp-3); font-size: var(--fs-caption); color: var(--text-muted); }
.gks-settings__history ul { margin-top: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1); }
</style>

