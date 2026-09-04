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

useHead({ title: 'Мэдүүлэг · CRM' });
</script>

<template>
  <div class="gks-crm">
    <header class="gks-crm__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-crm__title">Мэдүүлэг</h1>
      <p v-if="data" class="gks-crm__count gks-tnum">{{ data.meta.total }} мэдүүлэг</p>
    </header>

    <DsCard v-if="byUniversity.length" title="Сургууль тус бүрээр" eyebrow="Мэдүүлгийн тайлан">
      <table class="gks-table">
        <thead><tr><th>Сургууль</th><th>Нийт</th><th>Тэнцсэн</th><th>Татгалзсан</th></tr></thead>
        <tbody>
          <tr v-for="row in byUniversity" :key="row.name">
            <td>{{ row.name }}</td>
            <td class="gks-tnum">{{ row.total }}</td>
            <td class="gks-tnum">{{ row.accepted }}</td>
            <td class="gks-tnum">{{ row.rejected }}</td>
          </tr>
        </tbody>
      </table>
    </DsCard>

    <DsCard>
      <div class="gks-crm__filters">
        <DsInput v-model="q" icon-left="search" type="search" placeholder="Хэргийн код, хэрэглэгчээр хайх…" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="serviceType" :options="SERVICE_OPTIONS" aria-label="Үйлчилгээ" />
      </div>
    </DsCard>

    <DsCard v-if="error" accent><p>Мэдүүлгийн жагсаалтыг ачаалж чадсангүй.</p></DsCard>
    <div v-else-if="pending && !data" class="gks-crm__skeleton">
      <div v-for="n in 6" :key="n" class="gks-crm__skeleton-row" />
    </div>
    <DsCard v-else-if="!data?.items.length" padding="var(--sp-8)"><p class="gks-crm__empty">Мэдүүлэг олдсонгүй.</p></DsCard>

    <div v-else class="gks-crm__table-wrap">
      <table class="gks-table">
        <thead>
          <tr><th>Хэрэг</th><th>Хэрэглэгч</th><th>Сургууль</th><th>Үйлчилгээ</th><th>Төлөв</th><th>Илгээсэн</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id" class="gks-crm__row" @click="navigateTo(`/admin/applications/${item.case.id}`)">
            <td class="gks-tnum">{{ item.case.code }}</td>
            <td>{{ item.case.user?.name ?? '—' }}</td>
            <td>{{ item.university?.nameMn ?? UNKNOWN_LABEL }}</td>
            <td>{{ SERVICE_LABELS[item.case.serviceType] }}</td>
            <td><DsBadge :tone="APPLICATION_STATUS_TONE[item.status]">{{ APPLICATION_STATUS_LABELS[item.status] }}</DsBadge></td>
            <td class="gks-tnum">{{ formatDate(item.submittedAt) }}</td>
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

@media (max-width: 900px) { .gks-crm__filters { grid-template-columns: 1fr; } }
</style>
