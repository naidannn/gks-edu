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

    <div class="gks-catalog__layout">
      <aside class="gks-catalog__filters">
        <DsCard title="Шүүлтүүр">
          <template #action>
            <DsButton
              v-if="activeFilterCount || filters.q"
              variant="ghost"
              size="sm"
              icon-left="x"
              @click="router.push({ query: {} })"
            >
              Цэвэрлэх
            </DsButton>
          </template>

          <div class="gks-filters">
            <DsSelect
              label="Бүс нутаг"
              :options="regionOptions"
              :model-value="filters.region"
              @update:model-value="apply({ region: $event })"
            />

            <DsSelect
              label="Өмчийн хэлбэр"
              :options="typeOptions"
              :model-value="filters.type"
              @update:model-value="apply({ type: $event })"
            />

            <div class="gks-filters__group">
              <span class="gks-filters__legend">Элсэлтийн боломж</span>
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

            <p class="gks-filters__note">
              Элсэлтийн боломжийн мэдээллийг ажилтнууд сургууль бүрээр баталгаажуулж
              оруулж байна.
            </p>
          </div>
        </DsCard>
      </aside>

      <section class="gks-catalog__results">
        <div class="gks-catalog__toolbar">
          <DsInput
            v-model="searchInput"
            icon-left="search"
            type="search"
            placeholder="Сургууль, хотын нэрээр хайх…"
            aria-label="Сургууль хайх"
          />
          <DsSelect
            :options="SORTS"
            :model-value="filters.sort"
            aria-label="Эрэмбэлэх"
            @update:model-value="apply({ sort: $event })"
          />
        </div>

        <p class="gks-catalog__count">
          <strong class="gks-tnum">{{ total }}</strong> сургууль олдлоо
          <span v-if="filters.q">«{{ filters.q }}» хайлтаар</span>
        </p>

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
      </section>
    </div>
  </div>
</template>

<style scoped>
.gks-catalog { display: flex; flex-direction: column; gap: var(--sp-7); }

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

.gks-catalog__layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: var(--sp-7);
  align-items: start;
}
.gks-catalog__filters { position: sticky; top: var(--sp-4); }

.gks-filters { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-filters__group { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-filters__legend {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-filters__note {
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-subtle);
}

.gks-catalog__results { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-catalog__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px;
  gap: var(--sp-3);
}
.gks-catalog__count { font-size: var(--fs-body-sm); color: var(--text-muted); }

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

@media (max-width: 900px) {
  .gks-catalog__layout { grid-template-columns: minmax(0, 1fr); }
  .gks-catalog__filters { position: static; }
  .gks-catalog__toolbar { grid-template-columns: minmax(0, 1fr); }
}
</style>
