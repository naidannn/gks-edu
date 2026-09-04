<script setup lang="ts">
import type { CaseListItem, CaseStage, ServiceType } from '@gks/shared';

/** Staff case list — search, filter by stage/service, pagination (1C-18 groundwork). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: CaseListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STAGE_OPTIONS: { value: CaseStage | ''; label: string }[] = [
  { value: '', label: 'Бүх үе шат' },
  ...(Object.entries(CASE_STAGE_LABELS) as [CaseStage, string][]).map(([value, label]) => ({ value, label })),
];
const SERVICE_OPTIONS: { value: ServiceType | ''; label: string }[] = [
  { value: '', label: 'Бүх үйлчилгээ' },
  ...(Object.entries(SERVICE_LABELS) as [ServiceType, string][]).map(([value, label]) => ({ value, label })),
];

const api = useApi();
const q = ref('');
const stage = ref<CaseStage | ''>('');
const serviceType = ref<ServiceType | ''>('');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
  ...(serviceType.value ? { serviceType: serviceType.value } : {}),
}));

const data = ref<Paginated | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    data.value = await api.get<Paginated>('/cases', { query: query.value });
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

watch([stage, serviceType], () => { page.value = 1; load(); });
watch(page, load);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

function stageTone(s: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (['COMPLETED'].includes(s)) return 'success';
  if (['CANCELLED', 'REJECTED'].includes(s)) return 'danger';
  if (s === 'ON_HOLD') return 'warning';
  if (s === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

useHead({ title: 'Хэрэг · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-crm__title">Хэрэг</h1>
      <p v-if="data" class="gks-crm__count gks-tnum">{{ data.meta.total }} хэрэг</p>
    </header>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Код, хэрэглэгчийн нэр, имэйлээр хайх…" />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Үе шат" />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Хэргийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-crm__empty">Тохирох хэрэг олдсонгүй.</p>
    </DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr>
            <th>Код</th>
            <th>Хэрэглэгч</th>
            <th>Үйлчилгээ</th>
            <th>Сургууль</th>
            <th>Үе шат</th>
            <th>Үүсгэсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in data.items" :key="c.id" class="gks-crm__row" @click="navigateTo(`/admin/cases/${c.id}`)">
            <td class="gks-tnum">{{ c.code }}</td>
            <td>{{ c.user.name ?? c.user.email }}</td>
            <td>{{ SERVICE_LABELS[c.serviceType] }}</td>
            <td>{{ c.university?.nameMn ?? '—' }}</td>
            <td><DsBadge :tone="stageTone(c.stage)">{{ CASE_STAGE_LABELS[c.stage] }}</DsBadge></td>
            <td class="gks-tnum">{{ formatDate(c.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
.gks-crm { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-crm__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-crm__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-crm__filters { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: var(--sp-3); }

.gks-crm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-crm__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-crm__empty { text-align: center; color: var(--text-muted); }

.gks-crm__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); background: var(--surface-sunken); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-crm__row { cursor: pointer; }
.gks-crm__row:hover { background: var(--surface-sunken); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 900px) {
  .gks-crm__filters { grid-template-columns: 1fr 1fr; }
}
</style>
