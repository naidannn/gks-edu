<script setup lang="ts">
import type { ContractTemplate, ServiceType } from '@gks/shared';

/** Contract template text per service — `{{placeholder}}` tokens (1C-06). */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const SERVICE_TYPES = Object.keys(SERVICE_LABELS) as ServiceType[];
const PLACEHOLDER_NAMES = [
  'userLastName', 'userFirstName', 'userShortName', 'userRegister', 'userPhone', 'userEmail',
  'userAddress', 'guardianNote', 'universityName', 'contractDate', 'signatureDate',
  'totalAmount', 'totalAmountWords', 'prepaymentAmount', 'prepaymentAmountWords',
  'balanceAmount', 'balanceAmountWords', 'balanceCondition',
];
const OPEN = '{{';
const CLOSE = '}}';
const PLACEHOLDER_HINTS = PLACEHOLDER_NAMES.map((name) => `${OPEN}${name}${CLOSE}`);

const api = useApi();
const templates = ref<ContractTemplate[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    templates.value = await api.get<ContractTemplate[]>('/contracts/templates');
  } catch {
    errorMsg.value = 'Загваруудыг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const selectedService = ref<ServiceType>('LANGUAGE_PREP');
const activeTemplate = computed(() => templates.value.find((t) => t.serviceType === selectedService.value && t.isActive) ?? null);
const history = computed(() => templates.value.filter((t) => t.serviceType === selectedService.value && !t.isActive).sort((a, b) => b.version - a.version));

const draft = ref('');
watch([activeTemplate, selectedService], () => { draft.value = activeTemplate.value?.bodyMn ?? ''; }, { immediate: true });

const previewing = ref(false);
const submitting = ref(false);
async function submit() {
  if (!draft.value.trim()) return;
  errorMsg.value = null;
  submitting.value = true;
  try {
    await api.post('/contracts/templates', { serviceType: selectedService.value, bodyMn: draft.value });
    await load();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

useHead({ title: 'Гэрээний загвар · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Тохиргоо</span>
        <h1 class="gks-page__title">Гэрээний загвар</h1>
      </div>
    </header>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>

    <DsCard>
      <DsSelect v-model="selectedService" :options="SERVICE_TYPES.map((s) => ({ value: s, label: SERVICE_LABELS[s] }))" label="Үйлчилгээ" />
    </DsCard>

    <div v-if="pending && !templates.length" class="gks-skeleton__row gks-skeleton--page" />

    <DsCard v-else :title="`Идэвхтэй загвар (v${activeTemplate?.version ?? '—'})`">
      <DsTextarea v-model="draft" :rows="18" class="gks-settings__textarea" />
      <p class="gks-settings__hint">
        Ашиглаж болох placeholder: <code v-for="hint in PLACEHOLDER_HINTS" :key="hint">{{ hint }}</code>
      </p>
      <p class="gks-settings__hint">
        Байрлалын тэмдэглэгээ: <code>## Гарчиг</code> — голлосон бүлгийн гарчиг;
        <code>[[parties]] … [[|]] … [[/parties]]</code> — гарын үсгийн хоёр баганат хүснэгт;
        хоосон мөр шинэ догол мөр эхлүүлнэ.
      </p>
      <div class="gks-settings__actions">
        <DsButton :disabled="!draft.trim()" :loading="submitting" @click="submit">Шинэ хувилбар болгож хадгалах</DsButton>
        <DsButton variant="ghost" @click="previewing = !previewing">
          {{ previewing ? 'Урьдчилан харахыг хаах' : 'Урьдчилан харах' }}
        </DsButton>
      </div>
    </DsCard>

    <DsCard v-if="previewing" title="Урьдчилан харах">
      <p class="gks-settings__hint">
        Placeholder-ууд гэрээ үүсэх үед бөглөгдөнө — энд байгаагаар нь харагдаж байна.
      </p>
      <div class="gks-settings__preview">
        <ContractDocument :body="draft" number="СГ/26/001" :date="new Date()" />
      </div>
    </DsCard>

    <DsCard v-if="history.length" title="Хуучин хувилбарууд">
      <details v-for="t in history" :key="t.id" class="gks-settings__history-item">
        <summary>v{{ t.version }} — {{ formatNumericDate(t.updatedAt) }}</summary>
        <pre class="gks-settings__pre">{{ t.bodyMn }}</pre>
      </details>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-settings__textarea { width: 100%; font-family: var(--font-mono, monospace); font-size: var(--fs-caption); }
.gks-settings__hint { margin: var(--sp-3) 0; font-size: var(--fs-caption); color: var(--text-subtle); display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-settings__hint code { background: var(--surface-sunken); padding: 2px 6px; border-radius: var(--radius-1); }
.gks-settings__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-settings__preview {
  max-height: 620px;
  overflow-y: auto;
  border: 1px solid var(--line-hairline);
  border-radius: var(--radius-1);
}
.gks-settings__history-item { margin-bottom: var(--sp-3); font-size: var(--fs-body-sm); }
.gks-settings__pre { margin-top: var(--sp-2); padding: var(--sp-3); background: var(--surface-sunken); white-space: pre-wrap; font-size: var(--fs-caption); }
</style>

