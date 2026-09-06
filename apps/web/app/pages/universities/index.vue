<script setup lang="ts">
import type { UniversityCard, UniversityFacets, UniversityType } from '@gks/shared';

/** Catalogue of the 135 Korean partner universities (1A-06). */
type Paginated = {
  items: UniversityCard[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

const route = useRoute();
const router = useRouter();

const PAGE_SIZE = 12;
/**
 * `gks` is the default: our own recommendation order, computed on the API
 * (ARCHITECTURE.md §3.1). `rank` is Times Higher Education's South Korea rank,
 * for a visitor who would rather see the outside opinion.
 */
const SORTS: { value: string; label: string }[] = [
  { value: 'gks', label: 'Санал болгох эрэмбээр' },
  { value: 'rank', label: 'Солонгосын рэйтингээр' },
  { value: 'name', label: 'Нэрээр (А–Я)' },
  { value: 'students', label: 'Оюутны тоогоор' },
  { value: 'founded', label: 'Байгуулагдсан оноор' },
  { value: 'city', label: 'Хотоор' },
];

const DEFAULT_SORT = 'gks';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(str(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// The URL is the state: filters survive a reload and a shared link.
const filters = computed(() => ({
  q: str(route.query.q),
  region: str(route.query.region),
  type: str(route.query.type) as UniversityType | '',
  languagePrep: route.query.languagePrep === '1',
  gks: route.query.gks === '1',
  sort: str(route.query.sort) || DEFAULT_SORT,
  page: num(route.query.page, 1),
}));

const searchInput = ref(filters.value.q);
watch(() => filters.value.q, (value) => { searchInput.value = value; });

/** Merges a patch into the URL query; empty/false values drop the parameter. */
function apply(patch: Record<string, string | number | boolean | undefined>, resetPage = true) {
  const merged = { ...(route.query as Record<string, string>), ...patch };
  const query = Object.fromEntries(
    Object.entries(merged)
      .filter(([key, value]) => {
        if (resetPage && key === 'page') return false;
        return value !== '' && value !== false && value !== undefined && value !== null;
      })
      .map(([key, value]) => [key, value === true ? '1' : String(value)]),
  );
  router.push({ query });
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(searchInput, (value) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (value !== filters.value.q) apply({ q: value.trim() });
  }, 350);
});
onBeforeUnmount(() => clearTimeout(searchTimer));

const query = computed(() => ({
  page: filters.value.page,
  limit: PAGE_SIZE,
  sort: filters.value.sort,
  ...(filters.value.q ? { q: filters.value.q } : {}),
  ...(filters.value.region ? { region: filters.value.region } : {}),
  ...(filters.value.type ? { type: filters.value.type } : {}),
  ...(filters.value.languagePrep ? { languagePrep: true } : {}),
  ...(filters.value.gks ? { gks: true } : {}),
}));

const { data, status, error } = await useApiFetch<Paginated>('/universities', { query, lazy: true });
const { data: facets } = await useApiFetch<UniversityFacets>('/universities/facets', { lazy: true });

const activeFilterCount = computed(() =>
  [filters.value.region, filters.value.type, filters.value.languagePrep, filters.value.gks].filter(
    Boolean,
  ).length,
);

const regionOptions = computed(() => [
  { value: '', label: 'Бүх бүс нутаг' },
  ...(facets.value?.regions ?? []).map((r) => ({ value: r.value, label: `${r.label} (${r.count})` })),
]);

const typeOptions = computed(() => [
  { value: '', label: 'Бүх төрөл' },
  ...(facets.value?.types ?? []).map((t) => ({
    value: t.value,
    label: `${UNIVERSITY_TYPE_LABELS[t.value]} (${t.count})`,
  })),
]);

const total = computed(() => data.value?.meta.total ?? 0);
const totalPages = computed(() => data.value?.meta.totalPages ?? 1);

useHead({ title: 'Солонгосын их, дээд сургуулиуд' });
useSeoMeta({
  description:
    'Солонгосын 135 их, дээд сургуулийн каталог — байршил, оюутны тоо, амьжиргааны зардал, ' +
    'хэлний бэлтгэл, GKS тэтгэлгийн боломж. GKS EDU GROUP-ийн зуучлалын үйлчилгээ.',
  ogTitle: 'Солонгосын их, дээд сургуулиуд · GKS Edu',
  ogType: 'website',
});
// Filters are query strings on one page, not thousands of pages (`useSeo.ts`).
useListingSeo('/universities');
</script>

<template>
  <div class="gks-catalog">
    <header class="gks-catalog__head">
      <span class="gks-eyebrow">Сургуулийн каталог</span>
      <h1 class="gks-catalog__title">Солонгосын их, дээд сургуулиуд</h1>
      <p class="gks-catalog__lede">
        {{ facets?.total ?? 135 }} сургуулийн мэдээллийг байршил, төрөл, элсэлтийн боломжоор нь
        шүүж үзээрэй. Танд тохирохыг нь бид хамтдаа сонгоно.
      </p>
    </header>

    <CatalogFilterBar
      v-model:search="searchInput"
      search-placeholder="Сургууль, хотын нэрээр хайх…"
      search-label="Сургууль хайх"
      :active-count="activeFilterCount"
      :count="total"
      count-noun="сургууль"
      :loading="status === 'pending' && !data"
      :failed="!!error"
      :can-clear="activeFilterCount > 0 || !!filters.q"
      @clear="router.push({ query: {} })"
    >
      <DsSelect
        :options="regionOptions"
        :model-value="filters.region"
        aria-label="Бүс нутаг"
        @update:model-value="apply({ region: $event })"
      />
      <DsSelect
        :options="typeOptions"
        :model-value="filters.type"
        aria-label="Өмчийн хэлбэр"
        @update:model-value="apply({ type: $event })"
      />
      <DsSelect
        :options="SORTS"
        :model-value="filters.sort"
        aria-label="Эрэмбэлэх"
        @update:model-value="apply({ sort: $event })"
      />

      <template #extra>
        <div class="gks-catalog__toggles">
          <DsCheckbox
            :model-value="filters.languagePrep"
            :label="`Хэлний бэлтгэл авдаг (${facets?.languagePrep ?? 0})`"
            @update:model-value="apply({ languagePrep: $event })"
          />
          <DsCheckbox
            :model-value="filters.gks"
            :label="`GKS тэтгэлэгт хамрагддаг (${facets?.gks ?? 0})`"
            @update:model-value="apply({ gks: $event })"
          />
        </div>
        <p class="gks-catalog__note">
          Элсэлтийн боломжийн мэдээллийг ажилтнууд сургууль бүрээр баталгаажуулж оруулж байна.
        </p>
      </template>
    </CatalogFilterBar>

    <DsCard v-if="error" accent>
      <p>Сургуулийн мэдээллийг ачаалж чадсангүй. Хэсэг хугацааны дараа дахин оролдоно уу.</p>
    </DsCard>

    <div v-else-if="status === 'pending' && !data" class="gks-catalog__grid">
      <div v-for="n in 6" :key="n" class="gks-catalog__skeleton" />
    </div>

    <template v-else-if="data?.items.length">
      <ul class="gks-catalog__grid">
        <li v-for="university in data.items" :key="university.id">
          <UniversityCard :university="university" />
        </li>
      </ul>

      <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
        <DsButton
          variant="secondary"
          size="sm"
          icon-left="chevron-left"
          :disabled="filters.page <= 1"
          @click="apply({ page: filters.page - 1 }, false)"
        >
          Өмнөх
        </DsButton>
        <span class="gks-pager__status gks-tnum">{{ filters.page }} / {{ totalPages }}</span>
        <DsButton
          variant="secondary"
          size="sm"
          icon-right="chevron-right"
          :disabled="filters.page >= totalPages"
          @click="apply({ page: filters.page + 1 }, false)"
        >
          Дараах
        </DsButton>
      </nav>
    </template>

    <DsCard v-else>
      <div class="gks-catalog__empty">
        <DsIcon name="search-x" :size="28" />
        <p>Хайлтад тохирох сургууль олдсонгүй. Шүүлтүүрээ өөрчилж үзнэ үү.</p>
        <DsButton variant="secondary" size="sm" @click="router.push({ query: {} })">
          Шүүлтүүр цэвэрлэх
        </DsButton>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-catalog { display: flex; flex-direction: column; gap: var(--sp-5); }

.gks-catalog__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-catalog__lede {
  margin-top: var(--sp-3);
  max-width: var(--container-prose);
  color: var(--text-muted);
  line-height: var(--lh-body);
}

.gks-catalog__toggles { display: flex; flex-wrap: wrap; gap: var(--sp-3) var(--sp-5); }
.gks-catalog__note {
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-subtle);
}

.gks-catalog__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--sp-4);
  list-style: none;
}
.gks-catalog__skeleton {
  height: 260px;
  background: linear-gradient(var(--n-050), var(--n-100));
  border: var(--border-hair) solid var(--line-hairline);
}

.gks-catalog__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-6) 0;
  text-align: center;
  color: var(--text-muted);
}

.gks-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  padding-top: var(--sp-4);
}
.gks-pager__status { font-size: var(--fs-body-sm); color: var(--text-muted); }

/* A phone gets to the first card sooner: a smaller headline, a tighter lede. */
@media (max-width: 640px) {
  .gks-catalog { gap: var(--sp-4); }
  .gks-catalog__title { font-size: var(--fs-h2); }
  .gks-catalog__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); }
  .gks-catalog__grid { grid-template-columns: 1fr; }
}
</style>
