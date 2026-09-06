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

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

/* Filters live in the URL: a filtered queue can be bookmarked, shared and
   survives a refresh. */
useUrlFilters({
  q,
  stage: [stage, STAGE_OPTIONS.map((o) => o.value)],
  serviceType: [serviceType, SERVICE_OPTIONS.map((o) => o.value)],
});

useHead({ title: 'Үйлчилгээ · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Үйлчилгээ</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} үйлчилгээ</p>
      </div>
    </header>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Код, хэрэглэгчийн нэр, имэйлээр хайх…  ( / )"
        />
        <DsSelect v-model="stage" :options="STAGE_OPTIONS" aria-label="Үе шат" />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Үйлчилгээний жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)">
      <p class="gks-empty">Тохирох үйлчилгээ олдсонгүй.</p>
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
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
          <tr v-for="c in data.items" :key="c.id" class="gks-row" tabindex="0" @click="navigateTo(`/admin/cases/${c.id}`)" @keydown.enter="navigateTo(`/admin/cases/${c.id}`)">
            <td class="gks-tnum" data-label="Код">{{ c.code }}</td>
            <td data-label="Хэрэглэгч">{{ c.user.name ?? c.user.email }}</td>
            <td data-label="Үйлчилгээ">{{ SERVICE_LABELS[c.serviceType] }}</td>
            <td data-label="Сургууль">{{ universityName(c.university) }}</td>
            <td data-label="Үе шат"><DsBadge :tone="CASE_STAGE_TONE[c.stage]">{{ CASE_STAGE_LABELS[c.stage] }}</DsBadge></td>
            <td class="gks-tnum" data-label="Үүсгэсэн">{{ formatDate(c.createdAt) }}</td>
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

