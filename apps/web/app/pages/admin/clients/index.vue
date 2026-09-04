<script setup lang="ts">
import type {
  CaseStage,
  ClientListItem,
  ClientStats,
  ClientStatus,
  ContractStatus,
  LeadSource,
  ServiceType,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Client register (1B-14) — the people the office has taken on, as opposed to
 * the enquiries on `/admin/leads`. The brokerage stage of each client's live
 * case is part of the row, because "where is this person now" is the question
 * this screen exists to answer.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: ClientListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const SERVICE_OPTIONS: { value: ServiceType | ''; label: string }[] = [
  { value: '', label: 'Бүх үйлчилгээ' },
  ...(Object.entries(SERVICE_LABELS) as [ServiceType, string][]).map(([value, label]) => ({ value, label })),
];
const STAGE_OPTIONS: { value: CaseStage | ''; label: string }[] = [
  { value: '', label: 'Бүх үе шат' },
  ...(Object.entries(CASE_STAGE_LABELS) as [CaseStage, string][]).map(([value, label]) => ({ value, label })),
];
const STATUS_OPTIONS: { value: ClientStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][]).map(([value, label]) => ({ value, label })),
];
const SOURCE_OPTIONS: { value: LeadSource | ''; label: string }[] = [
  { value: '', label: 'Бүх суваг' },
  ...(Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][]).map(([value, label]) => ({ value, label })),
];
const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Бүртгүүлсэн огноогоор' },
  { value: 'lastName', label: 'Овгоор (А–Я)' },
  { value: 'updatedAt', label: 'Сүүлд өөрчилсөн' },
];

const auth = useAuthStore();
const api = useApi();

const q = ref('');
const serviceType = ref<ServiceType | ''>('');
const stage = ref<CaseStage | ''>('');
const status = ref<ClientStatus | ''>('');
const source = ref<LeadSource | ''>('');
const contractFilter = ref<'all' | 'with' | 'without'>('all');
const assignedFilter = ref<'all' | 'mine' | 'unassigned'>('all');
const sort = ref('createdAt');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  sort: sort.value,
  order: sort.value === 'lastName' ? 'asc' : 'desc',
  ...(q.value ? { q: q.value } : {}),
  ...(serviceType.value ? { serviceType: serviceType.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(source.value ? { source: source.value } : {}),
  ...(contractFilter.value === 'all' ? {} : { hasContract: contractFilter.value === 'with' }),
  ...(assignedFilter.value === 'mine' ? { assignedConsultantId: auth.user?.id } : {}),
  ...(assignedFilter.value === 'unassigned' ? { assignedConsultantId: 'unassigned' } : {}),
}));

const data = ref<Paginated | null>(null);
const stats = ref<ClientStats | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, summary] = await Promise.all([
      api.get<Paginated>('/clients', { query: query.value }),
      api.get<ClientStats>('/clients/stats'),
    ]);
    data.value = list;
    stats.value = summary;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

function clearFilters() {
  q.value = '';
  serviceType.value = '';
  stage.value = '';
  status.value = '';
  source.value = '';
  contractFilter.value = 'all';
  assignedFilter.value = 'all';
}

watch([serviceType, stage, status, source, contractFilter, assignedFilter, sort], () => {
  page.value = 1;
  load();
});
watch(page, load);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 300);
});
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

function stageTone(s: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'COMPLETED' || s === 'DEPARTED') return 'success';
  if (s === 'CANCELLED' || s === 'REJECTED') return 'danger';
  if (s === 'ON_HOLD') return 'warning';
  if (s === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}
function contractTone(s: ContractStatus): 'neutral' | 'info' | 'success' | 'danger' {
  if (s === 'ACTIVE' || s === 'COMPLETED') return 'success';
  if (s === 'TERMINATED') return 'danger';
  if (s === 'SIGNED' || s === 'SENT') return 'info';
  return 'neutral';
}
function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const hasFilters = computed(() =>
  Boolean(q.value || serviceType.value || stage.value || status.value || source.value)
  || contractFilter.value !== 'all'
  || assignedFilter.value !== 'all',
);

useHead({ title: 'Хэрэглэгч · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <div>
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-crm__title">Хэрэглэгч</h1>
        <p class="gks-crm__hint">Гэрээ байгуулсан болон бүртгэгдсэн харилцагчид, зуучлалын үе шаттайгаа.</p>
      </div>
      <div class="gks-crm__head-actions">
        <NuxtLink to="/admin/cases" class="gks-crm__cases-link">
          <DsIcon name="folder" :size="16" /> Хэргүүдийг үе шатаар нь харах
        </NuxtLink>
        <DsButton variant="accent" icon-left="user-plus" @click="navigateTo('/admin/clients/new')">
          Шинэ хэрэглэгч үүсгэх
        </DsButton>
      </div>
    </header>

    <section v-if="stats" class="gks-crm__summary" aria-label="Хэрэглэгчийн тойм">
      <div class="gks-crm__stat"><span>Нийт</span><strong class="gks-tnum">{{ stats.total }}</strong></div>
      <div class="gks-crm__stat"><span>Идэвхтэй</span><strong class="gks-tnum">{{ stats.byStatus.ACTIVE ?? 0 }}</strong></div>
      <div class="gks-crm__stat"><span>Гэрээтэй</span><strong class="gks-tnum">{{ stats.withContract }}</strong></div>
      <div class="gks-crm__stat"><span>Хариуцагчгүй</span><strong class="gks-tnum">{{ stats.unassigned }}</strong></div>
    </section>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Нэр, утас, регистр, код, имэйлээр хайх…" />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Зуучлалын үе шат" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="source" :options="SOURCE_OPTIONS" aria-label="Суваг" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-crm__toggles">
        <DsTag :selected="assignedFilter === 'all'" clickable @click="assignedFilter = 'all'">Бүгд</DsTag>
        <DsTag :selected="assignedFilter === 'mine'" clickable @click="assignedFilter = 'mine'">Надад оноогдсон</DsTag>
        <DsTag :selected="assignedFilter === 'unassigned'" clickable @click="assignedFilter = 'unassigned'">Хариуцагчгүй</DsTag>
        <span class="gks-crm__toggle-sep" aria-hidden="true" />
        <DsTag :selected="contractFilter === 'with'" clickable @click="contractFilter = contractFilter === 'with' ? 'all' : 'with'">Гэрээтэй</DsTag>
        <DsTag :selected="contractFilter === 'without'" clickable @click="contractFilter = contractFilter === 'without' ? 'all' : 'without'">Гэрээгүй</DsTag>
        <DsButton v-if="hasFilters" variant="ghost" size="sm" icon-left="x" @click="clearFilters">Шүүлтүүр цэвэрлэх</DsButton>
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Хэрэглэгчийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>

    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>

    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-crm__empty">
        {{ hasFilters ? 'Тохирох хэрэглэгч олдсонгүй.' : 'Одоогоор бүртгэгдсэн хэрэглэгч алга байна.' }}
      </p>
    </DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr>
            <th>Код</th>
            <th>Овог нэр</th>
            <th>Утас</th>
            <th>Үйлчилгээ</th>
            <th>Сургууль</th>
            <th>Зуучлалын үе шат</th>
            <th>Гэрээ</th>
            <th>Гэрээний огноо</th>
            <th>Хариуцагч</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in data.items" :key="c.id" class="gks-crm__row" @click="navigateTo(`/admin/clients/${c.id}`)">
            <td class="gks-tnum">{{ c.code }}</td>
            <td>
              <span class="gks-crm__name">{{ c.lastName }} {{ c.firstName }}</span>
              <span v-if="c.caseCount > 1" class="gks-crm__sub">{{ c.caseCount }} хэрэг</span>
            </td>
            <td class="gks-tnum">{{ c.phone }}</td>
            <td>{{ SERVICE_LABELS[c.activeCase?.serviceType ?? c.primaryServiceType] }}</td>
            <td>{{ c.activeCase?.university?.nameMn ?? c.targetUniversity?.nameMn ?? '—' }}</td>
            <td>
              <DsBadge v-if="c.activeCase" :tone="stageTone(c.activeCase.stage)">
                {{ CASE_STAGE_LABELS[c.activeCase.stage] }}
              </DsBadge>
              <span v-else class="gks-crm__muted">Хэрэг нээгээгүй</span>
            </td>
            <td>
              <DsBadge v-if="c.contractStatus" :tone="contractTone(c.contractStatus)">
                {{ CONTRACT_STATUS_LABELS[c.contractStatus] }}
              </DsBadge>
              <span v-else class="gks-crm__muted">—</span>
            </td>
            <td class="gks-tnum">{{ formatDate(c.contractDate) }}</td>
            <td>{{ c.assignedConsultant?.name ?? c.assignedConsultant?.email ?? '—' }}</td>
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
.gks-crm__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.gks-crm__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-crm__hint { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-crm__head-actions { display: flex; align-items: center; gap: var(--sp-4); }
.gks-crm__cases-link { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-subtle); text-decoration: none; }
.gks-crm__cases-link:hover { color: var(--brand-600); }

.gks-crm__summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-crm__stat {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  padding: var(--sp-4);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
}
.gks-crm__stat span { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-crm__stat strong { font-family: var(--font-display); font-size: var(--fs-h4); }

.gks-crm__filters { display: grid; grid-template-columns: 2fr repeat(5, 1fr); gap: var(--sp-3); }
.gks-crm__toggles { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); flex-wrap: wrap; }
.gks-crm__toggle-sep { width: 1px; height: 20px; background: var(--line-hairline); }

.gks-crm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-crm__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-crm__empty { text-align: center; color: var(--text-muted); }
.gks-crm__muted { color: var(--text-subtle); }

.gks-crm__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th { text-align: left; padding: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); border-bottom: var(--border-hair) solid var(--line-hairline); background: var(--surface-sunken); }
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-crm__row { cursor: pointer; }
.gks-crm__row:hover { background: var(--surface-sunken); }
.gks-crm__name { display: block; font-weight: var(--fw-medium); }
.gks-crm__sub { display: block; font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 1200px) {
  .gks-crm__filters { grid-template-columns: 1fr 1fr 1fr; }
}
@media (max-width: 900px) {
  .gks-crm__summary { grid-template-columns: 1fr 1fr; }
  .gks-crm__filters { grid-template-columns: 1fr 1fr; }
}
</style>
