<script setup lang="ts">
import type { LeadListItem, LeadSource, LeadStage, PaginatedResult } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Consultation requests (Зөвлөгөө хүсэлт) — the enquiries arriving from the
 * website, before anyone is under contract (1B-01, 1B-08).
 *
 * The record behind this screen is still `Lead`; only the wording is the
 * business's. Converting one produces a `Client`, and the two stay separate
 * rows so the sales history survives the conversion (1B-10).
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type Paginated = PaginatedResult<LeadListItem>;

const STAGE_OPTIONS = selectOptions(LEAD_STAGE_LABELS, 'Бүх үе шат');
const SOURCE_OPTIONS = selectOptions(LEAD_SOURCE_LABELS, 'Бүх суваг');
const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Үүсгэсэн огноогоор' },
  { value: 'nextContactAt', label: 'Дараагийн холбогдох огноогоор' },
  { value: 'updatedAt', label: 'Сүүлд өөрчилсөн' },
];

const auth = useAuthStore();
const api = useApi();

/* The dashboard links here pre-filtered; `useUrlFilters` below reads that. */
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

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

/* Filters live in the URL: a filtered queue can be bookmarked, shared and
   survives a refresh. */
useUrlFilters({
  q,
  stage: [stage, STAGE_OPTIONS.map((o) => o.value)],
  source: [source, SOURCE_OPTIONS.map((o) => o.value)],
  assigned: [assignedFilter, ['all', 'mine', 'unassigned']],
  sort: [sort, SORT_OPTIONS.map((o) => o.value)],
});

useHead({ title: 'Зөвлөгөө хүсэлт · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Зөвлөгөө хүсэлт</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} хүсэлт</p>
      </div>
      <div class="gks-page__actions">
        <DsButton variant="accent" icon-left="user-plus" @click="navigateTo('/admin/consultations/new')">
          Зөвлөгөө бүртгэх
        </DsButton>
      </div>
    </header>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Нэр, утас, имэйлээр хайх…  ( / )"
        />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Үе шат" />
        <DsSelect v-model="source" :options="SOURCE_OPTIONS" aria-label="Суваг" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-toggles">
        <DsTag :selected="assignedFilter === 'all'" clickable @click="assignedFilter = 'all'">Бүгд</DsTag>
        <DsTag :selected="assignedFilter === 'mine'" clickable @click="assignedFilter = 'mine'">Надад оноогдсон</DsTag>
        <DsTag :selected="assignedFilter === 'unassigned'" clickable @click="assignedFilter = 'unassigned'">Хариуцагчгүй</DsTag>
      </div>
    </DsCard>

    <DsCard v-if="error" accent>
      <p>Хүсэлтийн жагсаалтыг ачаалж чадсангүй.</p>
    </DsCard>

    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>

    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">Тохирох хүсэлт олдсонгүй.</p>
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
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
          <tr v-for="lead in data.items" :key="lead.id" class="gks-row" tabindex="0" @click="navigateTo(`/admin/consultations/${lead.id}`)" @keydown.enter="navigateTo(`/admin/consultations/${lead.id}`)">
            <td data-label="Нэр">
              {{ lead.lastName }} {{ lead.firstName }}
              <DsBadge v-if="lead.client" tone="success" icon="user-check">Үйлчлүүлэгч</DsBadge>
            </td>
            <td class="gks-tnum" data-label="Утас">{{ lead.phone }}</td>
            <td data-label="Суваг">{{ LEAD_SOURCE_LABELS[lead.source] }}</td>
            <td data-label="Үе шат"><DsBadge :tone="LEAD_STAGE_TONE[lead.stage]">{{ LEAD_STAGE_LABELS[lead.stage] }}</DsBadge></td>
            <td data-label="Хариуцагч">{{ lead.assignedTo?.name ?? lead.assignedTo?.email ?? '—' }}</td>
            <td class="gks-tnum" data-label="Дараагийн холбогдох">{{ formatDate(lead.nextContactAt) }}</td>
            <td class="gks-tnum" data-label="Үүсгэсэн">{{ formatDate(lead.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <DsPager v-model:page="page" :total-pages="totalPages" />
  </div>
</template>

