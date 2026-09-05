<script setup lang="ts">
import type { Application, ApplicationStatus, ServiceType, UniversityApplicationReportRow } from '@gks/shared';

/** 1E-11/1E-12 — every school application, plus the per-university outcome report. */
definePageMeta({ middleware: 'doc-staff', layout: 'admin' });

type Paginated = { items: Application[]; meta: { page: number; limit: number; total: number; totalPages: number } };

const STATUS_OPTIONS: { value: ApplicationStatus | ''; label: string }[] = [
  { value: '', label: 'Бүх төлөв' },
  ...(Object.entries(APPLICATION_STATUS_LABELS) as [ApplicationStatus, string][]).map(([value, label]) => ({ value, label })),
];
const SERVICE_OPTIONS: { value: ServiceType | ''; label: string }[] = [
  { value: '', label: 'Бүх үйлчилгээ' },
  ...(Object.entries(SERVICE_LABELS) as [ServiceType, string][]).map(([value, label]) => ({ value, label })),
];

const api = useApi();
const q = ref('');
const status = ref<ApplicationStatus | ''>('');
const serviceType = ref<ServiceType | ''>('');
const page = ref(1);

const data = ref<Paginated | null>(null);
const report = ref<UniversityApplicationReportRow[]>([]);
const pending = ref(true);
const error = ref(false);

const query = computed(() => ({
  page: page.value,
  limit: 20,
  ...(q.value ? { q: q.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(serviceType.value ? { serviceType: serviceType.value } : {}),
}));

async function load() {
  pending.value = true;
  error.value = false;
  try {
    const [list, rows] = await Promise.all([
      api.get<Paginated>('/applications', { query: query.value }),
      api.get<UniversityApplicationReportRow[]>('/applications/report/universities'),
    ]);
    data.value = list;
    report.value = rows;
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}

watch([status, serviceType], () => { page.value = 1; load(); });
watch(page, load);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page.value = 1; load(); }, 350); });
onBeforeUnmount(() => clearTimeout(searchTimer));
onMounted(load);

/** One row per university, with the outcomes it decided folded in (1E-12). */
const byUniversity = computed(() => {
  const map = new Map<string, { name: string; total: number; accepted: number; rejected: number }>();
  for (const row of report.value) {
    const key = row.university?.nameMn ?? 'Сургууль сонгоогүй';
    const entry = map.get(key) ?? { name: key, total: 0, accepted: 0, rejected: 0 };
    entry.total += row.count;
    if (row.status === 'ACCEPTED') entry.accepted += row.count;
    if (row.status === 'REJECTED') entry.rejected += row.count;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 8);
});

const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

/* Filters live in the URL: a filtered queue can be bookmarked, shared and
   survives a refresh. */
useUrlFilters({
  q,
  status: [status, STATUS_OPTIONS.map((o) => o.value)],
  serviceType: [serviceType, SERVICE_OPTIONS.map((o) => o.value)],
});

useHead({ title: 'Мэдүүлэг · CRM' });
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">CRM</span>
        <h1 class="gks-page__title">Мэдүүлэг</h1>
        <p v-if="data" class="gks-result-count gks-tnum">{{ data.meta.total }} мэдүүлэг</p>
      </div>
    </header>

    <DsCard v-if="byUniversity.length" title="Сургууль тус бүрээр" eyebrow="Мэдүүлгийн тайлан">
      <table class="gks-table gks-table--cards">
        <thead><tr><th>Сургууль</th><th>Нийт</th><th>Тэнцсэн</th><th>Татгалзсан</th></tr></thead>
        <tbody>
          <tr v-for="row in byUniversity" :key="row.name">
            <td data-label="Сургууль">{{ row.name }}</td>
            <td class="gks-tnum" data-label="Нийт">{{ row.total }}</td>
            <td class="gks-tnum" data-label="Тэнцсэн">{{ row.accepted }}</td>
            <td class="gks-tnum" data-label="Татгалзсан">{{ row.rejected }}</td>
          </tr>
        </tbody>
      </table>
    </DsCard>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          icon-left="search"
          type="search"
          placeholder="Хэргийн код, хэрэглэгчээр хайх…  ( / )"
        />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Мэдүүлгийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-empty">Мэдүүлэг олдсонгүй.</p></DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr><th>Хэрэг</th><th>Хэрэглэгч</th><th>Сургууль</th><th>Үйлчилгээ</th><th>Төлөв</th><th>Илгээсэн</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id" class="gks-row" tabindex="0" @click="navigateTo(`/admin/applications/${item.case.id}`)" @keydown.enter="navigateTo(`/admin/applications/${item.case.id}`)">
            <td class="gks-tnum" data-label="Хэрэг">{{ item.case.code }}</td>
            <td data-label="Хэрэглэгч">{{ item.case.user?.name ?? '—' }}</td>
            <td data-label="Сургууль">{{ item.university?.nameMn ?? UNKNOWN_LABEL }}</td>
            <td data-label="Үйлчилгээ">{{ SERVICE_LABELS[item.case.serviceType] }}</td>
            <td data-label="Төлөв"><DsBadge :tone="APPLICATION_STATUS_TONE[item.status]">{{ APPLICATION_STATUS_LABELS[item.status] }}</DsBadge></td>
            <td class="gks-tnum" data-label="Илгээсэн">{{ formatDate(item.submittedAt) }}</td>
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

