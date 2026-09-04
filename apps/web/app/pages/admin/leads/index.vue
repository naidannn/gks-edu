<script setup lang="ts">
import type { LeadListItem, LeadSource, LeadStage } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/** Staff lead list — search, filters, pagination (1B-01, 1B-08). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = { items: LeadListItem[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STAGE_OPTIONS: { value: LeadStage | ''; label: string }[] = [
  { value: '', label: 'Бүх үе шат' },
  ...(Object.entries(LEAD_STAGE_LABELS) as [LeadStage, string][]).map(([value, label]) => ({ value, label })),
];
const SOURCE_OPTIONS: { value: LeadSource | ''; label: string }[] = [
  { value: '', label: 'Бүх суваг' },
  ...(Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][]).map(([value, label]) => ({ value, label })),
];
const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Үүсгэсэн огноогоор' },
  { value: 'nextContactAt', label: 'Дараагийн холбогдох огноогоор' },
  { value: 'updatedAt', label: 'Сүүлд өөрчилсөн' },
];

const auth = useAuthStore();
const api = useApi();

const q = ref('');
const stage = ref<LeadStage | ''>('');
const source = ref<LeadSource | ''>('');
const assignedFilter = ref<'all' | 'mine' | 'unassigned'>('all');
const sort = ref('createdAt');
const page = ref(1);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  sort: sort.value,
  order: 'desc',
  ...(q.value ? { q: q.value } : {}),
  ...(stage.value ? { stage: stage.value } : {}),
  ...(source.value ? { source: source.value } : {}),
  ...(assignedFilter.value === 'mine' ? { assignedToId: auth.user?.id } : {}),
  ...(assignedFilter.value === 'unassigned' ? { assignedToId: 'unassigned' } : {}),
}));

const data = ref<Paginated | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    data.value = await api.get<Paginated>('/leads', { query: query.value });
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

watch([stage, source, assignedFilter, sort], () => { page.value = 1; load(); });
watch(page, load);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { page.value = 1; load(); }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

onMounted(load);

function stageTone(s: LeadStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (s === 'WON') return 'success';
  if (s === 'LOST') return 'danger';
  if (s === 'NEW') return 'neutral';
  return 'info';
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

useHead({ title: 'Сэжимүүд · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-crm__title">Сэжимүүд</h1>
      <p v-if="data" class="gks-crm__count gks-tnum">{{ data.meta.total }} сэжим</p>
    </header>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Нэр, утас, имэйлээр хайх…" />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Үе шат" />
        <DsSelect v-model="source" :options="SOURCE_OPTIONS" aria-label="Суваг" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-crm__toggles">
        <DsTag :selected="assignedFilter === 'all'" clickable @click="assignedFilter = 'all'">Бүгд</DsTag>
        <DsTag :selected="assignedFilter === 'mine'" clickable @click="assignedFilter = 'mine'">Надад оноогдсон</DsTag>
        <DsTag :selected="assignedFilter === 'unassigned'" clickable @click="assignedFilter = 'unassigned'">Хариуцагчгүй</DsTag>
      </div>
    </DsCard>

    <DsCard v-if="error" accent>
      <p>Сэжимийн жагсаалтыг ачаалж чадсангүй.</p>
    </DsCard>

    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>

    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-crm__empty">Тохирох сэжим олдсонгүй.</p>
    </DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr>
            <th>Нэр</th>
            <th>Утас</th>
            <th>Суваг</th>
            <th>Үе шат</th>
            <th>Хариуцагч</th>
            <th>Дараагийн холбогдох</th>
            <th>Үүсгэсэн</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="lead in data.items" :key="lead.id" class="gks-crm__row" @click="navigateTo(`/admin/leads/${lead.id}`)">
            <td>
              {{ lead.lastName }} {{ lead.firstName }}
              <DsBadge v-if="lead.client" tone="success" icon="user-check">Хэрэглэгч</DsBadge>
            </td>
            <td class="gks-tnum">{{ lead.phone }}</td>
            <td>{{ LEAD_SOURCE_LABELS[lead.source] }}</td>
            <td><DsBadge :tone="stageTone(lead.stage)">{{ LEAD_STAGE_LABELS[lead.stage] }}</DsBadge></td>
            <td>{{ lead.assignedTo?.name ?? lead.assignedTo?.email ?? '—' }}</td>
            <td class="gks-tnum">{{ formatDate(lead.nextContactAt) }}</td>
            <td class="gks-tnum">{{ formatDate(lead.createdAt) }}</td>
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
.gks-crm__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
}
.gks-crm__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-crm__filters { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: var(--sp-3); }
.gks-crm__toggles { display: flex; gap: var(--sp-2); margin-top: var(--sp-4); }

.gks-crm__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-crm__skeleton-row { height: 44px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-crm__empty { text-align: center; color: var(--text-muted); }

.gks-crm__table-wrap { overflow-x: auto; border: var(--border-hair) solid var(--line-hairline); background: var(--surface-card); }
.gks-table { width: 100%; border-collapse: collapse; font-size: var(--fs-body-sm); white-space: nowrap; }
.gks-table th {
  text-align: left;
  padding: var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-sunken);
}
.gks-table td { padding: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-crm__row { cursor: pointer; }
.gks-crm__row:hover { background: var(--surface-sunken); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 900px) {
  .gks-crm__filters { grid-template-columns: 1fr 1fr; }
}
</style>
