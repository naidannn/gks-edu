<script setup lang="ts">
import type { AdminProgram, AdminProgramStats, PaginatedResult, ProgramLevel } from '@gks/shared';

/**
 * Programmes and tuition across every school.
 *
 * The screen exists to answer one question — "which schools teach marketing,
 * and what do they charge?" — so the subject filter and the tuition column
 * carry it. The three counters above the table are the gaps that are invisible
 * in the rows themselves: a programme with no price, one filed under no
 * subject (a subject search will never find it), and one nobody has checked
 * against the school.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Хөтөлбөр, төлбөр · Админ' });

type Paginated = PaginatedResult<AdminProgram>;

const api = useApi();
const route = useRoute();
const router = useRouter();

const PAGE_SIZE = 25;

const q = ref(typeof route.query.q === 'string' ? route.query.q : '');
/**
 * Set when arriving from one school's page.
 *
 * It used to have no control and no place on screen, so every later search
 * from this page stayed scoped to that school with nothing saying so — the
 * office searched the whole catalogue and got one school's answer. It is a
 * chip now, and clearing it takes the school out of the URL too.
 */
const universityId = ref(typeof route.query.universityId === 'string' ? route.query.universityId : '');
const level = ref<ProgramLevel | ''>('');
const region = ref('');
const language = ref('');
const tuitionMax = ref('');
const topikMax = ref('');
const sort = ref('university');
const order = ref<'asc' | 'desc'>('asc');
const noFaculty = ref(false);
const missingTuition = ref(false);
const unverified = ref(false);
const page = ref(1);

const rows = ref<AdminProgram[]>([]);
const meta = ref<Paginated['meta'] | null>(null);
const stats = ref<AdminProgramStats | null>(null);
const regions = ref<{ value: string; label: string; count: number }[]>([]);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

const LEVEL_OPTIONS = selectOptions(PROGRAM_LEVEL_LABELS, 'Бүх түвшин');
const LANGUAGE_OPTIONS = selectOptions(INSTRUCTION_LANGUAGE_LABELS, 'Бүх хэл');
const SORT_OPTIONS = [
  { value: 'university:asc', label: 'Сургуулиар' },
  { value: 'tuition:asc', label: 'Төлбөр — хямдаас' },
  { value: 'tuition:desc', label: 'Төлбөр — үнэтэйгээс' },
  { value: 'name:asc', label: 'Нэрээр' },
  { value: 'topik:asc', label: 'TOPIK шаардлагаар' },
];
const TOPIK_OPTIONS = [
  { value: '', label: 'TOPIK хамаагүй' },
  ...[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `TOPIK ${value} ба түүнээс доош` })),
];
/** Round numbers a consultant actually thinks in, not an arbitrary slider. */
const TUITION_OPTIONS = [
  { value: '', label: 'Төлбөр хамаагүй' },
  { value: '4000000', label: 'Жилд ₩4 сая хүртэл' },
  { value: '6000000', label: 'Жилд ₩6 сая хүртэл' },
  { value: '8000000', label: 'Жилд ₩8 сая хүртэл' },
  { value: '10000000', label: 'Жилд ₩10 сая хүртэл' },
];

const regionOptions = computed(() => [
  { value: '', label: 'Бүх бүс' },
  ...regions.value.map((entry) => ({ value: entry.value, label: `${entry.label} (${entry.count})` })),
]);

const query = computed(() => {
  const [sortKey, sortOrder] = sort.value.split(':');
  return {
    page: page.value,
    limit: PAGE_SIZE,
    sort: sortKey,
    order: sortOrder ?? order.value,
    ...(q.value ? { q: q.value } : {}),
    ...(universityId.value ? { universityId: universityId.value } : {}),
    ...(level.value ? { level: level.value } : {}),
    ...(region.value ? { region: region.value } : {}),
    ...(language.value ? { language: language.value } : {}),
    ...(tuitionMax.value ? { tuitionMax: tuitionMax.value } : {}),
    ...(topikMax.value ? { topikMax: topikMax.value } : {}),
    ...(noFaculty.value ? { noFaculty: true } : {}),
    ...(missingTuition.value ? { missingTuition: true } : {}),
    ...(unverified.value ? { unverified: true } : {}),
  };
});

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    const result = await api.get<Paginated>('/admin/programs', { query: query.value });
    rows.value = result.items;
    meta.value = result.meta;
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хөтөлбөрийн жагсаалтыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

async function loadAside() {
  const [statsResult, facets] = await Promise.all([
    api.get<AdminProgramStats>('/admin/programs/stats').catch(() => null),
    api.get<{ regions: { value: string; label: string; count: number }[] }>('/programs/facets').catch(() => null),
  ]);
  stats.value = statsResult;
  regions.value = facets?.regions ?? [];
}

watch([level, region, language, tuitionMax, topikMax, sort, noFaculty, missingTuition, unverified], () => {
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
  loadAside();
});

const totalPages = computed(() => meta.value?.totalPages ?? 1);

/** Named from the rows themselves rather than a second request for one name. */
const universityFilterLabel = computed(() => {
  const first = rows.value[0]?.university;
  return first ? universityName(first) : 'Сонгосон сургууль';
});

async function clearUniversityFilter() {
  universityId.value = '';
  page.value = 1;
  const { universityId: _dropped, ...rest } = route.query;
  await router.replace({ query: rest });
  await load();
}

/** The annual figure, derived from a semester price when that is all we have. */
function annual(program: AdminProgram): string {
  const value = annualTuitionKrw(program);
  return formatKrw(value) ?? '—';
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-page__title">Хөтөлбөр, сургалтын төлбөр</h1>
        <p class="gks-page__hint">
          Бүх сургуулийн ангиудыг нэг дороос. Хайлт нь ангийн монгол, англи, солонгос нэр,
          танхим болон сургуулийн нэр дээр ажиллана.
        </p>
      </div>
      <DsButton variant="accent" icon-left="plus" @click="navigateTo('/admin/programs/new')">
        Шинэ хөтөлбөр
      </DsButton>
    </header>

    <ul v-if="stats" class="gks-stats">
      <li class="gks-stat">
        <span>Нийт хөтөлбөр</span>
        <strong class="gks-tnum">{{ stats.total }}</strong>
      </li>
      <li class="gks-stat" :class="{ 'gks-stat--warn': stats.missingTuition > 0 }">
        <span>Төлбөргүй</span>
        <strong class="gks-tnum">{{ stats.missingTuition }}</strong>
      </li>
      <li class="gks-stat" :class="{ 'gks-stat--warn': stats.noFaculty > 0 }">
        <span>Танхимгүй</span>
        <strong class="gks-tnum">{{ stats.noFaculty }}</strong>
      </li>
      <li class="gks-stat">
        <span>Хянагдаагүй</span>
        <strong class="gks-tnum">{{ stats.unverified }}</strong>
      </li>
      <li class="gks-stat" :class="{ 'gks-stat--warn': stats.staleTuition > 0 }">
        <span>Хуучирсан үнэ</span>
        <strong class="gks-tnum">{{ stats.staleTuition }}</strong>
      </li>
    </ul>

    <DsCard>
      <div class="gks-filters">
        <DsInput
          v-model="q"
          class="gks-filters__search"
          type="search"
          icon-left="search"
          placeholder="Хөтөлбөр, сургуулийн нэрээр хайх…"
        />
        <DsSelect v-model="level" :options="LEVEL_OPTIONS" aria-label="Түвшин" />
        <DsSelect v-model="region" :options="regionOptions" aria-label="Бүс" />
        <DsSelect v-model="language" :options="LANGUAGE_OPTIONS" aria-label="Хичээлийн хэл" />
        <DsSelect v-model="tuitionMax" :options="TUITION_OPTIONS" aria-label="Төлбөрийн дээд хязгаар" />
        <DsSelect v-model="topikMax" :options="TOPIK_OPTIONS" aria-label="TOPIK" />
        <DsSelect v-model="sort" :options="SORT_OPTIONS" aria-label="Эрэмбэ" />
      </div>
      <div class="gks-toggles">
        <DsTag v-if="universityId" clickable selected @click="clearUniversityFilter">
          {{ universityFilterLabel }} ✕
        </DsTag>
        <DsTag clickable :selected="noFaculty" @click="noFaculty = !noFaculty">Танхимгүй</DsTag>
        <DsTag clickable :selected="missingTuition" @click="missingTuition = !missingTuition">Төлбөргүй</DsTag>
        <DsTag clickable :selected="unverified" @click="unverified = !unverified">Хянагдаагүй</DsTag>
        <span class="gks-result-count gks-tnum">{{ meta?.total ?? 0 }} хөтөлбөр</span>
      </div>
    </DsCard>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <div v-else-if="pending && !rows.length" class="gks-skeleton">
      <div v-for="n in 6" :key="n" class="gks-skeleton__row" />
    </div>

    <DsCard v-else-if="!rows.length">
      Энэ шүүлтүүрт тохирох хөтөлбөр алга. Шинээр нэмэх, эсвэл сургуулийн хуудсан дээрээс
      "Интернэтээс судлах"-аар ангиудыг нь олоорой.
    </DsCard>

    <div v-else class="gks-table-wrap">
      <table class="gks-table gks-table--cards">
        <thead>
          <tr>
            <th scope="col">Сургууль</th>
            <th scope="col">Хөтөлбөр</th>
            <th scope="col">Танхим</th>
            <th scope="col">Түвшин</th>
            <th scope="col">Жилийн төлбөр</th>
            <th scope="col">Улирлын</th>
            <th scope="col">Элсэлтийн хураамж</th>
            <th scope="col">Хөнгөлөлт</th>
            <th scope="col">TOPIK</th>
            <th scope="col">Төлөв</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.id"
            class="gks-row"
            tabindex="0"
            @click="navigateTo(`/admin/programs/new?id=${row.id}`)"
            @keydown.enter="navigateTo(`/admin/programs/new?id=${row.id}`)"
          >
            <td data-label="Сургууль">
              <span class="gks-prog__uni">{{ row.university.nameMn }}</span>
              <small>{{ row.university.cityMn }}</small>
            </td>
            <td data-label="Хөтөлбөр">
              <span class="gks-prog__name">{{ row.nameMn }}</span>
              <small v-if="row.nameKo">{{ row.nameKo }}</small>
              <small v-else-if="row.nameEn">{{ row.nameEn }}</small>
            </td>
            <td data-label="Танхим">
              <DsBadge v-if="row.faculty" tone="neutral">{{ row.faculty.nameKo ?? row.faculty.nameMn }}</DsBadge>
              <DsBadge v-else tone="warning">Танхимгүй</DsBadge>
            </td>
            <td data-label="Түвшин">
              {{ PROGRAM_LEVEL_LABELS[row.level] }}
              <small>{{ INSTRUCTION_LANGUAGE_LABELS[row.language] }}</small>
            </td>
            <td class="gks-tnum gks-prog__tuition" data-label="Жилийн төлбөр">
              {{ annual(row) }}
              <small>{{ tuitionYearLabel(row.tuitionYear) }}</small>
            </td>
            <td class="gks-tnum" data-label="Улирлын">{{ formatKrw(row.tuitionPerTermKrw) ?? '—' }}</td>
            <td class="gks-tnum" data-label="Элсэлтийн хураамж">{{ formatKrw(row.admissionFeeKrw) ?? '—' }}</td>
            <td class="gks-tnum" data-label="Хөнгөлөлт">
              {{ row.scholarshipMaxPercent === null ? '—' : `${row.scholarshipMaxPercent}%` }}
            </td>
            <td class="gks-tnum" data-label="TOPIK">{{ row.topikLevel ?? '—' }}</td>
            <td data-label="Төлөв">
              <DsBadge v-if="!row.isPublished" tone="neutral">Ноорог</DsBadge>
              <DsBadge v-if="!row.verifiedAt" tone="warning">Хянагдаагүй</DsBadge>
              <span class="gks-prog__source">{{ PROGRAM_SOURCE_LABELS[row.sourceType] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <DsPager v-model:page="page" :total-pages="totalPages" variant="ghost" />
  </div>
</template>

<style scoped>
.gks-prog__uni { font-weight: var(--fw-semibold); }
.gks-prog__name { font-weight: var(--fw-semibold); }
/* The column the screen exists for. */
.gks-prog__tuition { color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-prog__source { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
</style>
