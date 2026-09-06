<script setup lang="ts">
import type {
  AdmissionListItem,
  AdminIntakeTermWithUniversity,
  IntakeStatus,
  PaginatedResult,
  ProgramLevel,
} from '@gks/shared';

/**
 * Staff admissions list (1H-05).
 *
 * The two columns that carry the screen are "манай эцсийн хугацаа" and
 * "хянагдсан эсэх": a round nobody has checked against the school, or one with
 * no deadline at all, is the row that quietly costs a student their place.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Элсэлт · Админ' });

type Row = AdminIntakeTermWithUniversity;
type Paginated = PaginatedResult<Row>;
type Stats = { openIntakes: number; closingSoon: number; missingDates: number; atRisk: number };

const api = useApi();
const route = useRoute();

const PAGE_SIZE = 25;

const q = ref(typeof route.query.q === 'string' ? route.query.q : '');
const level = ref<ProgramLevel | ''>('');
const status = ref<IntakeStatus | ''>('');
const year = ref('');
const unverified = ref(false);
const missingDates = ref(false);
const sort = ref('deadline');
const page = ref(1);

const rows = ref<Row[]>([]);
const meta = ref<Paginated['meta'] | null>(null);
const stats = ref<Stats | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

const LEVEL_OPTIONS = [
  { value: '', label: 'Бүх түвшин' },
  ...Object.entries(PROGRAM_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];
const STATUS_OPTIONS = [
  { value: '', label: 'Бүх төлөв' },
  ...Object.entries(INTAKE_STATUS_LABELS).map(([value, label]) => ({ value, label })),
];
const SORT_OPTIONS = [
  { value: 'deadline', label: 'Хугацаагаар' },
  { value: 'classStart', label: 'Хичээл эхлэхээр' },
  { value: 'university', label: 'Сургуулиар' },
];
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = [
  { value: '', label: 'Бүх жил' },
  ...[currentYear, currentYear + 1, currentYear + 2].map((y) => ({ value: String(y), label: `${y} он` })),
];

const query = computed(() => ({
  page: page.value,
  limit: PAGE_SIZE,
  sort: sort.value,
  order: 'asc',
  ...(q.value ? { q: q.value } : {}),
  ...(level.value ? { level: level.value } : {}),
  ...(status.value ? { status: status.value } : {}),
  ...(year.value ? { year: year.value } : {}),
  ...(unverified.value ? { unverified: true } : {}),
  ...(missingDates.value ? { missingDates: true } : {}),
}));

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    const result = await api.get<Paginated>('/admin/admissions', { query: query.value });
    rows.value = result.items;
    meta.value = result.meta;
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Элсэлтийн жагсаалтыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

async function loadStats() {
  try {
    stats.value = await api.get<Stats>('/admin/admissions/stats');
  } catch {
    stats.value = null;
  }
}

watch([level, status, year, unverified, missingDates, sort], () => {
  page.value = 1;
  load();
});
watch(page, load);

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(q, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 1;
    load();
  }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

onMounted(() => {
  load();
  loadStats();
});

const totalPages = computed(() => meta.value?.totalPages ?? 1);

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function countdown(row: AdmissionListItem | Row): string {
  const days = row.daysUntilInternalDeadline;
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)} хоног хэтэрсэн`;
  return `${days} хоног`;
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-page__title">Элсэлтийн хугацаа</h1>
        <p class="gks-page__hint">
          Манай бүртгэлийн эцсийн хугацаа нь сургуулийн хугацаанаас
          <NuxtLink to="/admin/settings/admissions">тохируулсан хоногийн өмнө</NuxtLink> автоматаар
          бодогдоно. Гараар өөр огноо тавибал дахин бодохдоо дарж бичихгүй.
        </p>
      </div>
      <DsButton variant="accent" icon-left="plus" @click="navigateTo('/admin/admissions/new')">
        Шинэ элсэлт
      </DsButton>
    </header>

    <ul v-if="stats" class="gks-stats">
      <li class="gks-stat">
        <span>Нээлттэй элсэлт</span>
        <strong class="gks-tnum">{{ stats.openIntakes }}</strong>
      </li>
      <li class="gks-stat">
        <span>30 хоногт хаагдана</span>
        <strong class="gks-tnum">{{ stats.closingSoon }}</strong>
      </li>
      <li class="gks-stat" :class="{ 'gks-stat--warn': stats.missingDates > 0 }">
        <span>Хугацаа оруулаагүй</span>
        <strong class="gks-tnum">{{ stats.missingDates }}</strong>
      </li>
      <li class="gks-stat" :class="{ 'gks-stat--danger': stats.atRisk > 0 }">
        <span>Эрсдэлтэй үйлчилгээ</span>
        <strong class="gks-tnum">
          <NuxtLink to="/admin/admissions/board">{{ stats.atRisk }}</NuxtLink>
        </strong>
      </li>
    </ul>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          type="search"
          icon-left="search"
          placeholder="Сургуулийн нэрээр хайх…  ( / )"
        />
        <DsSelect v-model="level" :options="LEVEL_OPTIONS" aria-label="Түвшин" />
        <DsSelect v-model="status" :options="STATUS_OPTIONS" aria-label="Төлөв" />
        <DsSelect v-model="year" :options="YEAR_OPTIONS" aria-label="Жил" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-toggles">
        <DsTag clickable :selected="unverified" @click="unverified = !unverified">Хянагдаагүй</DsTag>
        <DsTag clickable :selected="missingDates" @click="missingDates = !missingDates">Хугацаагүй</DsTag>
        <span class="gks-result-count gks-tnum">{{ meta?.total ?? 0 }} мөр</span>
      </div>
    </DsCard>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <div v-else-if="pending && !rows.length" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>

    <DsCard v-else-if="!rows.length">
      Энэ шүүлтүүрт тохирох элсэлт алга. Шинэ элсэлт нэмэх, эсвэл шүүлтүүрээ өөрчилнө үү.
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr>
            <th scope="col">Сургууль</th>
            <th scope="col">Элсэлт</th>
            <th scope="col">Манай хугацаа</th>
            <th scope="col">Сургуулийн хугацаа</th>
            <th scope="col">Хичээл эхлэх</th>
            <th scope="col">Үлдсэн</th>
            <th scope="col">Үйлчилгээ</th>
            <th scope="col">Төлөв</th>
            <th scope="col">Эх сурвалж</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="gks-row"
            tabindex="0"
            @click="navigateTo(`/admin/admissions/new?id=${row.id}`)"
            @keydown.enter="navigateTo(`/admin/admissions/new?id=${row.id}`)"
          >
            <td data-label="Сургууль">
              <span class="gks-adm-admin__uni">{{ universityName(row.university) }}</span>
              <small>{{ universitySubName(row.university) }}</small>
            </td>
            <td class="gks-tnum" data-label="Элсэлт">
              {{ row.year }} · {{ INTAKE_MONTH_LABELS[row.month] ?? `${row.month}-р сар` }}
              <small>{{ PROGRAM_LEVEL_LABELS[row.level] }}</small>
            </td>
            <td class="gks-tnum gks-adm-admin__ours" data-label="Манай хугацаа">
              {{ formatDate(row.internalDeadline) }}
              <small v-if="row.internalDeadlineIsManual">гараар</small>
            </td>
            <td class="gks-tnum" data-label="Сургуулийн хугацаа">{{ formatDate(row.applicationDeadline) }}</td>
            <td class="gks-tnum" data-label="Хичээл эхлэх">{{ formatDate(row.classStartDate) }}</td>
            <td class="gks-tnum" data-label="Үлдсэн">{{ countdown(row) }}</td>
            <td class="gks-tnum" data-label="Үйлчилгээ">{{ row._count.cases }}</td>
            <td data-label="Төлөв">
              <DsBadge :tone="INTAKE_PHASE_TONE[row.phase]">{{ INTAKE_PHASE_LABELS[row.phase] }}</DsBadge>
            </td>
            <td data-label="Эх сурвалж">
              <span class="gks-adm-admin__source">{{ INTAKE_SOURCE_LABELS[row.sourceType] }}</span>
              <DsBadge v-if="!row.verifiedAt" tone="warning">Хянагдаагүй</DsBadge>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton variant="ghost" size="sm" icon-left="chevron-left" :disabled="page <= 1" @click="page -= 1">
        Өмнөх
      </DsButton>
      <span class="gks-tnum">{{ page }} / {{ totalPages }}</span>
      <DsButton
        variant="ghost"
        size="sm"
        icon-right="chevron-right"
        :disabled="page >= totalPages"
        @click="page += 1"
      >
        Дараах
      </DsButton>
    </nav>
  </div>
</template>

<style scoped>
.gks-adm-admin__uni { font-weight: var(--fw-semibold); }
/* Ours is the date every case is driven to. */
.gks-adm-admin__ours { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-adm-admin__source { display: block; color: var(--text-subtle); font-size: var(--fs-caption); }
</style>

