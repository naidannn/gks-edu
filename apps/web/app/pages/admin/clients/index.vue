<script setup lang="ts">
import type {
  CaseStage,
  ClientAttentionFilter,
  ClientListItem,
  ClientStats,
  ClientStatus,
  LeadSource,
  ServiceType,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * The client register (1B-14, reshaped in 1G-17) — the people the office has
 * taken on, as opposed to the enquiries on `/admin/consultations`.
 *
 * One row answers "where is this person, and does anything need me": the stage
 * of their live case, how far along it is, and the flags for missing paperwork,
 * unpaid invoices and overdue work. Clicking it opens their workspace.
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
const ATTENTION_FILTERS: { value: ClientAttentionFilter; label: string }[] = [
  { value: 'MISSING_DOCS', label: 'Материал дутуу' },
  { value: 'PENDING_PAYMENT', label: 'Төлбөр хүлээгдэж буй' },
  { value: 'OVERDUE_TASK', label: 'Хугацаа хэтэрсэн ажил' },
  { value: 'DEADLINE_SOON', label: 'Хугацаа дөхсөн' },
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
/* Seeding from the URL — so a dashboard tile opens the queue it counted — is
   `useUrlFilters`' job now, below. */
const attention = ref<ClientAttentionFilter | ''>('');
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
  ...(attention.value ? { attention: attention.value } : {}),
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
  attention.value = '';
}

watch([serviceType, stage, status, source, contractFilter, assignedFilter, attention, sort], () => {
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

/** The row's warning chips — at most two, worst first, so the table stays readable. */
function attentionChips(client: ClientListItem) {
  const chips: { key: string; tone: 'danger' | 'warning'; label: string }[] = [];
  const flags = client.attention;
  if (flags.overdueTasks > 0) chips.push({ key: 'task', tone: 'danger', label: 'Ажил хэтэрсэн' });
  if (flags.overdue && flags.nextDeadline) chips.push({ key: 'due', tone: 'danger', label: 'Хугацаа хэтэрсэн' });
  if (flags.missingDocuments > 0) {
    chips.push({ key: 'docs', tone: 'warning', label: `${flags.missingDocuments} материал дутуу` });
  }
  if (flags.pendingPayments > 0) chips.push({ key: 'pay', tone: 'warning', label: 'Төлбөр хүлээгдэж буй' });
  return chips.slice(0, 2);
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const hasFilters = computed(() =>
  Boolean(q.value || serviceType.value || stage.value || status.value || source.value || attention.value)
  || contractFilter.value !== 'all'
  || assignedFilter.value !== 'all',
);

/* Filters live in the URL: a filtered queue can be bookmarked, shared and
   survives a refresh. */
useUrlFilters({
  q,
  serviceType: [serviceType, SERVICE_OPTIONS.map((o) => o.value)],
  stage: [stage, STAGE_OPTIONS.map((o) => o.value)],
  status: [status, STATUS_OPTIONS.map((o) => o.value)],
  source: [source, SOURCE_OPTIONS.map((o) => o.value)],
  contract: [contractFilter, ['all', 'with', 'without']],
  assigned: [assignedFilter, ['all', 'mine', 'unassigned']],
  attention: [attention, ATTENTION_FILTERS.map((f) => f.value)],
  sort: [sort, SORT_OPTIONS.map((o) => o.value)],
});

useHead({ title: 'Үйлчлүүлэгч · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Үйлчлүүлэгч</h1>
        <p class="gks-page__hint">Хүн бүрийн үе шат, явц, анхаарал шаардсан зүйл — нэг мөрөнд.</p>
      </div>
      <div class="gks-page__actions">
        <DsButton variant="accent" icon-left="user-plus" @click="navigateTo('/admin/clients/new')">
          Шинэ үйлчлүүлэгч
        </DsButton>
      </div>
    </header>

    <section v-if="stats" class="gks-stats" aria-label="Хэрэглэгчийн тойм">
      <button type="button" class="gks-stat" :class="{ 'gks-stat--active': !hasFilters }" @click="clearFilters">
        <span>Нийт</span><strong class="gks-tnum">{{ stats.total }}</strong>
      </button>
      <button
        type="button"
        class="gks-stat"
        :class="{ 'gks-stat--active': status === 'ACTIVE' }"
        @click="status = status === 'ACTIVE' ? '' : 'ACTIVE'"
      >
        <span>Идэвхтэй</span><strong class="gks-tnum">{{ stats.byStatus.ACTIVE ?? 0 }}</strong>
      </button>
      <button
        type="button"
        class="gks-stat"
        :class="{ 'gks-stat--active': contractFilter === 'with' }"
        @click="contractFilter = contractFilter === 'with' ? 'all' : 'with'"
      >
        <span>Гэрээтэй</span><strong class="gks-tnum">{{ stats.withContract }}</strong>
      </button>
      <button
        type="button"
        class="gks-stat"
        :class="{ 'gks-stat--warn': stats.unassigned > 0, 'gks-stat--active': assignedFilter === 'unassigned' }"
        @click="assignedFilter = assignedFilter === 'unassigned' ? 'all' : 'unassigned'"
      >
        <span>Хариуцагчгүй</span><strong class="gks-tnum">{{ stats.unassigned }}</strong>
      </button>
    </section>

    <DsCard padding="var(--sp-5)">
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Нэр, утас, регистр, код, имэйлээр хайх…  ( / )"
        />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Зуучлалын үе шат" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="source" :options="SOURCE_OPTIONS" aria-label="Суваг" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-toggles">
        <DsTag :selected="assignedFilter === 'all'" clickable @click="assignedFilter = 'all'">Бүгд</DsTag>
        <DsTag :selected="assignedFilter === 'mine'" clickable @click="assignedFilter = 'mine'">Надад оноогдсон</DsTag>
        <DsTag :selected="assignedFilter === 'unassigned'" clickable @click="assignedFilter = 'unassigned'">Хариуцагчгүй</DsTag>
        <span class="gks-toggle-sep" aria-hidden="true" />
        <DsTag :selected="contractFilter === 'with'" clickable @click="contractFilter = contractFilter === 'with' ? 'all' : 'with'">Гэрээтэй</DsTag>
        <DsTag :selected="contractFilter === 'without'" clickable @click="contractFilter = contractFilter === 'without' ? 'all' : 'without'">Гэрээгүй</DsTag>
        <span class="gks-toggle-sep" aria-hidden="true" />
        <DsTag
          v-for="filter in ATTENTION_FILTERS"
          :key="filter.value"
          :selected="attention === filter.value"
          clickable
          @click="attention = attention === filter.value ? '' : filter.value"
        >
          {{ filter.label }}
        </DsTag>
        <DsButton v-if="hasFilters" variant="ghost" size="sm" icon-left="x" @click="clearFilters">Шүүлтүүр цэвэрлэх</DsButton>
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Үйлчлүүлэгчийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>

    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 8" :key="n" class="gks-skeleton__row" />
    </div>

    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">
        {{ hasFilters ? 'Тохирох үйлчлүүлэгч олдсонгүй.' : 'Одоогоор бүртгэгдсэн үйлчлүүлэгч алга байна.' }}
      </p>
    </DsCard>

    <template v-else>
      <p class="gks-result-count gks-tnum">{{ data.meta.total }} үйлчлүүлэгч</p>

      <div class="gks-table-wrap">
        <table class="gks-table gks-table--cards">
          <thead>
            <tr>
              <th>Овог нэр</th>
              <th>Утас</th>
              <th>Үйлчилгээ · сургууль</th>
              <th>Үе шат</th>
              <th>Явц</th>
              <th>Анхаарах</th>
              <th>Хариуцагч</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in data.items"
              :key="c.id"
              class="gks-row"
              tabindex="0"
              @click="navigateTo(`/admin/clients/${c.id}`)"
              @keydown.enter="navigateTo(`/admin/clients/${c.id}`)"
            >
              <td data-label="Овог нэр">
                <span>
                  <!-- A real link so the row can be opened in a new tab; the
                       row click stays for everything else. -->
                  <NuxtLink :to="`/admin/clients/${c.id}`" class="gks-cell-name" @click.stop>
                    {{ c.lastName }} {{ c.firstName }}
                  </NuxtLink>
                  <span class="gks-cell-sub gks-tnum">
                    {{ c.code }}<template v-if="c.caseCount > 1"> · {{ c.caseCount }} үйлчилгээ</template>
                  </span>
                </span>
              </td>
              <td class="gks-tnum" data-label="Утас">{{ c.phone }}</td>
              <td data-label="Үйлчилгээ">
                <span>
                  <span>{{ SERVICE_LABELS[c.activeCase?.serviceType ?? c.primaryServiceType] }}</span>
                  <span class="gks-cell-sub">
                    {{ universityName(c.activeCase?.university ?? c.targetUniversity) }}
                  </span>
                </span>
              </td>
              <td data-label="Үе шат">
                <DsBadge v-if="c.activeCase" :tone="CASE_STAGE_TONE[c.activeCase.stage]">
                  {{ CASE_STAGE_LABELS[c.activeCase.stage] }}
                </DsBadge>
                <span v-else class="gks-muted">Үйлчилгээ эхлээгүй</span>
              </td>
              <td data-label="Явц">
                <div class="gks-progress">
                  <span class="gks-progress__track">
                    <span class="gks-progress__fill" :style="{ width: `${c.progressPercent}%` }" />
                  </span>
                  <span class="gks-progress__value gks-tnum">{{ c.progressPercent }}%</span>
                </div>
              </td>
              <td data-label="Анхаарах">
                <div v-if="attentionChips(c).length" class="gks-chips">
                  <DsBadge v-for="chip in attentionChips(c)" :key="chip.key" :tone="chip.tone">{{ chip.label }}</DsBadge>
                </div>
                <span v-else class="gks-muted">—</span>
              </td>
              <td data-label="Хариуцагч">{{ c.assignedConsultant?.name ?? c.assignedConsultant?.email ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="secondary" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">Өмнөх</DsButton>
      <span class="gks-pager__status gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton variant="secondary" size="sm" icon-right="chevron-right" :disabled="page >= totalPages" @click="page += 1">Дараах</DsButton>
    </nav>
  </div>
</template>

<style scoped>
/* Everything this page used to declare — header, stats, filters, table, pager,
   skeleton — now lives in `assets/css/admin.css`. */
.gks-cell-name { text-decoration: none; }
.gks-cell-name:hover { color: var(--brand-700); text-decoration: underline; }
</style>
