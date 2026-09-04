<script setup lang="ts">
import type { VisaCase, VisaStatus, VisaView } from '@gks/shared';

/**
 * 1F-10 — the visa desk. The list on the left, the picked case on the right with
 * its state machine and the decision that unlocks the balance payment (1F-05).
 */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });

type Paginated = { items: VisaCase[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STATUS_OPTIONS: { value: VisaStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(VISA_STATUS_LABELS) as [VisaStatus, string][]).map(([value, label]) => ({ value, label })),
];

/** Only the moves the API accepts from each state (1F-01). */
const NEXT: Record<VisaStatus, VisaStatus[]> = {
  COLLECTING: ['REVIEWING'],
  REVIEWING: ['READY', 'COLLECTING'],
  READY: ['SUBMITTED'],
  SUBMITTED: ['ADDITIONAL_DOCS_REQUESTED'],
  ADDITIONAL_DOCS_REQUESTED: ['SUBMITTED'],
  APPROVED: [],
  REJECTED: ['REAPPLY'],
  REAPPLY: ['COLLECTING'],
};

const api = useApi();
const q = ref('');
const status = ref<VisaStatus | ''>('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const selectedCaseId = ref<string | null>(null);
const detail = ref<VisaView | null>(null);
const pending = ref(true);
const busy = ref(false);
const error = ref<string | null>(null);

const decision = reactive({ visaNumber: '', expiresAt: '', rejectionReason: '' });
const appointmentAt = ref('');

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(status.value ? { status: status.value } : {}),
}));

async function load() {
  pending.value = true;
  try {
    data.value = await api.get<Paginated>('/visa-cases', { query: query.value });
    if (!selectedCaseId.value && data.value.items[0]) await select(data.value.items[0].caseId);
  } finally {
    pending.value = false;
  }
}

async function select(caseId: string) {
  selectedCaseId.value = caseId;
  detail.value = await api.get<VisaView>(`/cases/${caseId}/visa`);
  appointmentAt.value = detail.value.visaCase?.appointmentAt?.slice(0, 16) ?? '';
}

async function act(action: () => Promise<unknown>) {
  busy.value = true;
  error.value = null;
  try {
    await action();
    await select(selectedCaseId.value!);
    data.value = await api.get<Paginated>('/visa-cases', { query: query.value });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Үйлдэл амжилтгүй боллоо';
  } finally {
    busy.value = false;
  }
}

const current = computed(() => detail.value?.visaCase ?? null);
const nextStatuses = computed(() => (current.value ? NEXT[current.value.status] : []));

function transition(toStatus: VisaStatus) {
  return act(() => api.post(`/cases/${selectedCaseId.value}/visa/transitions`, { toStatus }));
}
function saveAppointment() {
  return act(() => api.patch(`/cases/${selectedCaseId.value}/visa`, { appointmentAt: new Date(appointmentAt.value).toISOString() }));
}
function approve() {
  return act(() =>
    api.post(`/cases/${selectedCaseId.value}/visa/decision`, {
      decision: 'APPROVED',
      visaNumber: decision.visaNumber || undefined,
      expiresAt: decision.expiresAt ? new Date(decision.expiresAt).toISOString() : undefined,
    }),
  );
}
function reject() {
  return act(() =>
    api.post(`/cases/${selectedCaseId.value}/visa/decision`, {
      decision: 'REJECTED',
      rejectionReason: decision.rejectionReason,
    }),
  );
}

watch(status, () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 350); });
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const canDecide = computed(() => current.value?.status === 'SUBMITTED');

useHead({ title: 'Виз · CRM' });
</script>

<template>
  <div class="gks-visadm">
    <header class="gks-visadm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-visadm__title">Визний хэрэг</h1>
      <p v-if="data" class="gks-visadm__count gks-tnum">{{ data.meta.total }} хэрэг</p>
    </header>

    <DsCard>
      <div class="gks-visadm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Хэргийн код, хэрэглэгчээр хайх…" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
      </div>
    </DsCard>

    <p v-if="error" class="gks-visadm__error">{{ error }}</p>

    <div class="gks-visadm__grid">
      <aside class="gks-visadm__list">
        <div v-if="pending && !data" class="gks-visadm__skeleton"><div v-for="n in 5" :key="n" class="gks-visadm__skeleton-row" /></div>
        <p v-else-if="!data?.items.length" class="gks-visadm__empty">Визний хэрэг алга байна.</p>
        <button
          v-for="item in data?.items ?? []"
          :key="item.id"
          type="button"
          class="gks-visadm__item"
          :class="{ 'gks-visadm__item--active': item.caseId === selectedCaseId }"
          @click="select(item.caseId)"
        >
          <span class="gks-visadm__item-case gks-tnum">{{ item.case.code }}</span>
          <span class="gks-visadm__item-name">{{ item.case.user.name ?? '—' }}</span>
          <DsBadge :tone="VISA_STATUS_TONE[item.status]">{{ VISA_STATUS_LABELS[item.status] }}</DsBadge>
        </button>

        <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
          <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
          <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
          <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
        </nav>
      </aside>

      <section v-if="current" class="gks-visadm__detail">
        <DsCard :title="current.case.code" :eyebrow="VISA_TYPE_LABELS[current.visaType]">
          <template #action>
            <DsBadge :tone="VISA_STATUS_TONE[current.status]">{{ VISA_STATUS_LABELS[current.status] }}</DsBadge>
          </template>

          <dl class="gks-visadm__facts">
            <div><dt>Хэрэглэгч</dt><dd>{{ current.case.user.name ?? '—' }}</dd></div>
            <div><dt>Утас</dt><dd class="gks-tnum">{{ current.case.user.phone ?? '—' }}</dd></div>
            <div><dt>Сургууль</dt><dd>{{ current.case.university?.nameMn ?? UNKNOWN_LABEL }}</dd></div>
          </dl>

          <div class="gks-visadm__row">
            <DsInput v-model="appointmentAt" type="datetime-local" label="Элчин сайдын яамны цаг" />
            <DsButton variant="secondary" :disabled="!appointmentAt || busy" @click="saveAppointment">Хадгалах</DsButton>
          </div>

          <div class="gks-visadm__actions">
            <DsButton v-for="next in nextStatuses" :key="next" size="sm" variant="secondary" :disabled="busy" @click="transition(next)">
              {{ VISA_STATUS_LABELS[next] }}
            </DsButton>
          </div>
        </DsCard>

        <DsCard v-if="canDecide" title="Визний хариу бүртгэх" eyebrow="Үлдэгдэл төлбөр / буцаалт идэвхжинэ">
          <div class="gks-visadm__row">
            <DsInput v-model="decision.visaNumber" label="Визний дугаар" />
            <DsInput v-model="decision.expiresAt" type="date" label="Дуусах огноо" />
            <DsButton variant="accent" :disabled="busy" @click="approve">Виз гарсан</DsButton>
          </div>
          <div class="gks-visadm__row">
            <DsInput v-model="decision.rejectionReason" label="Татгалзсан шалтгаан" />
            <DsButton variant="danger" :disabled="!decision.rejectionReason || busy" @click="reject">Виз татгалзсан</DsButton>
          </div>
        </DsCard>

        <DsCard v-if="detail?.checklist" padding="var(--sp-5)">
          <DocumentsProgressBar :progress="detail.checklist.progress" label="Визний материал" />
          <ul class="gks-visadm__docs">
            <li v-for="doc in detail.checklist.documents" :key="doc.id">
              <span>{{ doc.template.nameMn }}</span>
              <DsBadge :tone="DOCUMENT_STATUS_TONE[doc.status]">{{ DOCUMENT_STATUS_LABELS[doc.status] }}</DsBadge>
            </li>
          </ul>
        </DsCard>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gks-visadm { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-visadm__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-visadm__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-visadm__filters { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-3); }
.gks-visadm__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-visadm__grid { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: var(--sp-4); align-items: start; }
.gks-visadm__list { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-visadm__item {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  align-items: flex-start;
  text-align: left;
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  cursor: pointer;
}
.gks-visadm__item:hover { background: var(--surface-hover); }
.gks-visadm__item--active { border-color: var(--brand-600); background: var(--surface-selected); }
.gks-visadm__item-case { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-visadm__item-name { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }

.gks-visadm__detail { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-visadm__facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-4); }
.gks-visadm__facts dt { font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
.gks-visadm__facts dd { font-size: var(--fs-body-sm); color: var(--text-body); margin-top: 2px; }
.gks-visadm__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--sp-3); align-items: end; margin-bottom: var(--sp-3); }
.gks-visadm__actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-visadm__docs { margin-top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-2); font-size: var(--fs-body-sm); }
.gks-visadm__docs li { display: flex; justify-content: space-between; align-items: center; gap: var(--sp-3); }
.gks-visadm__empty { color: var(--text-subtle); font-style: italic; }
.gks-visadm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-visadm__skeleton-row { height: 64px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-3); margin-top: var(--sp-2); }
.gks-pager__status { font-size: var(--fs-caption); color: var(--text-muted); }

@media (max-width: 1100px) {
  .gks-visadm__grid { grid-template-columns: 1fr; }
  .gks-visadm__filters { grid-template-columns: 1fr; }
}
</style>
