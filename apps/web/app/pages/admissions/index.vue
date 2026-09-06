<script setup lang="ts">
import type { AdmissionFacets, AdmissionListItem, PaginatedResult, ProgramLevel } from '@gks/shared';

/**
 * The public intake calendar (1H-06).
 *
 * Sorted by our own deadline, not the school's — that is the date a visitor
 * actually has to plan around, and showing the school's later one first is how
 * somebody arrives a week late with unfinished documents.
 */
type Paginated = PaginatedResult<AdmissionListItem>;

const route = useRoute();
const router = useRouter();

const PAGE_SIZE = 18;
const SORTS: { value: string; label: string }[] = [
  { value: 'deadline', label: 'Хугацаа дуусахаар' },
  { value: 'classStart', label: 'Хичээл эхлэхээр' },
  { value: 'gks', label: 'Санал болгох эрэмбээр' },
  { value: 'university', label: 'Сургуулийн нэрээр' },
];
const DEFAULT_SORT = 'deadline';

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown, fallback: number): number => {
  const parsed = Number.parseInt(str(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// The URL is the state: a filtered calendar survives a reload and a shared link.
const filters = computed(() => ({
  q: str(route.query.q),
  level: str(route.query.level) as ProgramLevel | '',
  year: str(route.query.year),
  month: str(route.query.month),
  region: str(route.query.region),
  sort: str(route.query.sort) || DEFAULT_SORT,
  page: num(route.query.page, 1),
}));

const searchInput = ref(filters.value.q);
watch(
  () => filters.value.q,
  (value) => {
    searchInput.value = value;
  },
);

function apply(patch: Record<string, string | number | undefined>, resetPage = true) {
  const merged = { ...(route.query as Record<string, string>), ...patch };
  const query = Object.fromEntries(
    Object.entries(merged)
      .filter(([key, value]) => {
        if (resetPage && key === 'page') return false;
        return value !== '' && value !== undefined && value !== null;
      })
      .map(([key, value]) => [key, String(value)]),
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
  ...(filters.value.level ? { level: filters.value.level } : {}),
  ...(filters.value.year ? { year: filters.value.year } : {}),
  ...(filters.value.month ? { month: filters.value.month } : {}),
  ...(filters.value.region ? { region: filters.value.region } : {}),
}));

const { data, status, error } = await useApiFetch<Paginated>('/admissions', { query, lazy: true });
const { data: facets } = await useApiFetch<AdmissionFacets>('/admissions/facets', { lazy: true });

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.meta.total ?? 0);
const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const activeFilterCount = computed(
  () => [filters.value.level, filters.value.year, filters.value.month, filters.value.region].filter(Boolean).length,
);

const levelOptions = computed(() => [
  { value: '', label: 'Бүх түвшин' },
  ...(facets.value?.levels ?? []).map((row) => ({
    value: row.value,
    label: `${PROGRAM_LEVEL_LABELS[row.value]} (${row.count})`,
  })),
]);

const monthOptions = computed(() => [
  { value: '', label: 'Бүх улирал' },
  ...(facets.value?.months ?? []).map((row) => ({
    value: String(row.value),
    label: `${INTAKE_MONTH_LABELS[row.value] ?? `${row.value}-р сар`} (${row.count})`,
  })),
]);

const yearOptions = computed(() => [
  { value: '', label: 'Бүх жил' },
  ...(facets.value?.years ?? []).map((row) => ({ value: String(row.value), label: `${row.value} он (${row.count})` })),
]);

const regionOptions = computed(() => [
  { value: '', label: 'Бүх бүс нутаг' },
  ...(facets.value?.regions ?? []).map((row) => ({ value: row.value, label: `${row.label} (${row.count})` })),
]);

/**
 * An em dash for a date the school has not published — the same convention the
 * university page uses. Never a substituted date (CLAUDE.md); the longer
 * "мэдээлэл шинэчлэгдэж байна" wording belongs in prose, not in a two-column
 * date row where it wraps over three lines.
 */
function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function countdownLabel(days: number | null): string {
  if (days === null) return 'Хугацаа тодорхойгүй';
  if (days < 0) return 'Хугацаа дууссан';
  if (days === 0) return 'Өнөөдөр хаагдана';
  return `${days} хоног үлдлээ`;
}

/** Urgency, not status: the phase badge already says whether it is open. */
function countdownTone(days: number | null): BadgeTone {
  if (days === null) return 'neutral';
  if (days < 0) return 'neutral';
  if (days <= 7) return 'danger';
  if (days <= 21) return 'warning';
  return 'success';
}

useHead({ title: 'Солонгосын сургуулиудын элсэлт' });
useSeoMeta({
  description:
    'Солонгосын их, дээд сургуулиудын хэлний бэлтгэл, бакалавр, магистр, докторын элсэлтийн ' +
    'хугацаа — материал хүлээн авах эцсийн хугацаа, хичээл эхлэх огноогоор шүүж үзнэ үү.',
  ogTitle: 'Сургуулиудын элсэлтийн хугацаа · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-adm">
    <header class="gks-adm__head">
      <span class="gks-eyebrow">Элсэлтийн хуанли</span>
      <h1 class="gks-adm__title">Сургуулиудын элсэлтийн хугацаа</h1>
      <p class="gks-adm__lede">
        Хэлний бэлтгэл, бакалавр, магистр, докторын элсэлтүүд. Бүртгэлийн эцсийн хугацаа хүртэл
        хэдийд ч бүртгүүлэх боломжтой — жагсаалт нь хугацаа нь хамгийн түрүүнд дуусахаар нь
        эрэмбэлэгдэнэ.
      </p>
      <p v-if="facets?.closingSoon" class="gks-adm__alert">
        <DsIcon name="bell-ring" :size="16" />
        Ойрын 14 хоногт <strong class="gks-tnum">{{ facets.closingSoon }}</strong> элсэлтийн бүртгэл хаагдана.
      </p>
    </header>

    <CatalogFilterBar
      v-model:search="searchInput"
      search-placeholder="Сургуулийн нэрээр хайх"
      search-label="Сургуулийн нэрээр хайх"
      :active-count="activeFilterCount"
      :count="total"
      count-noun="элсэлт"
      :loading="status === 'pending' && !items.length"
      :failed="!!error"
      :can-clear="activeFilterCount > 0 || !!filters.q"
      @clear="router.push({ query: {} })"
    >
      <DsSelect
        :model-value="filters.level"
        :options="levelOptions"
        aria-label="Түвшин"
        @update:model-value="apply({ level: String($event) })"
      />
      <DsSelect
        :model-value="filters.month"
        :options="monthOptions"
        aria-label="Элсэлтийн улирал"
        @update:model-value="apply({ month: String($event) })"
      />
      <DsSelect
        :model-value="filters.year"
        :options="yearOptions"
        aria-label="Жил"
        @update:model-value="apply({ year: String($event) })"
      />
      <DsSelect
        :model-value="filters.region"
        :options="regionOptions"
        aria-label="Бүс нутаг"
        @update:model-value="apply({ region: String($event) })"
      />
      <DsSelect
        :model-value="filters.sort"
        :options="SORTS"
        aria-label="Эрэмбэ"
        @update:model-value="apply({ sort: String($event) })"
      />
    </CatalogFilterBar>

    <DsCard v-if="error" accent class="gks-adm__state">
      Элсэлтийн мэдээллийг ачаалахад алдаа гарлаа. Хуудсаа дахин ачаална уу.
    </DsCard>

    <div v-else-if="status === 'pending' && !items.length" class="gks-adm__grid">
      <div v-for="n in 6" :key="n" class="gks-adm__skeleton" />
    </div>

    <DsCard v-else-if="!items.length" class="gks-adm__state">
      Энэ шүүлтүүрт тохирох элсэлт олдсонгүй. Шүүлтүүрээ өөрчилж үзээрэй.
    </DsCard>

    <ul v-else class="gks-adm__grid">
      <li v-for="intake in items" :key="intake.id">
        <article class="gks-adm-card">
          <header class="gks-adm-card__head">
            <img
              v-if="intake.university.logoPath"
              :src="intake.university.logoPath"
              :alt="`${intake.university.nameEn} лого`"
              width="44"
              height="44"
            >
            <span v-else class="gks-adm-card__logo" aria-hidden="true"><DsIcon name="landmark" :size="20" /></span>
            <div class="gks-adm-card__identity">
              <h2>
                <NuxtLink :to="`/universities/${intake.university.slug}`">{{ intake.university.nameEn }}</NuxtLink>
              </h2>
              <p>{{ intake.university.cityMn }} · {{ PROGRAM_LEVEL_LABELS[intake.level] }}</p>
            </div>
            <DsBadge :tone="INTAKE_PHASE_TONE[intake.phase]">{{ INTAKE_PHASE_LABELS[intake.phase] }}</DsBadge>
          </header>

          <p class="gks-adm-card__term">
            {{ intake.year }} оны {{ INTAKE_MONTH_LABELS[intake.month] ?? `${intake.month}-р сар` }}
          </p>

          <dl class="gks-adm-card__dates">
            <div>
              <dt>Бүртгэлийн эцсийн хугацаа</dt>
              <dd class="gks-tnum">{{ formatDate(intake.internalDeadline) }}</dd>
            </div>
            <div>
              <dt>Хичээл эхлэх</dt>
              <dd class="gks-tnum">{{ formatDate(intake.classStartDate) }}</dd>
            </div>
          </dl>

          <footer class="gks-adm-card__foot">
            <DsBadge :tone="countdownTone(intake.daysUntilInternalDeadline)">
              {{ countdownLabel(intake.daysUntilInternalDeadline) }}
            </DsBadge>
            <NuxtLink
              class="gks-adm-card__cta"
              :to="{ path: '/app/start', query: { universityId: intake.university.id, intakeId: intake.id } }"
            >
              Бүртгүүлэх <DsIcon name="arrow-right" :size="14" />
            </NuxtLink>
          </footer>
        </article>
      </li>
    </ul>

    <nav v-if="totalPages > 1" class="gks-pager" aria-label="Хуудаслалт">
      <DsButton
        variant="ghost"
        size="sm"
        icon-left="chevron-left"
        :disabled="filters.page <= 1"
        @click="apply({ page: filters.page - 1 }, false)"
      >
        Өмнөх
      </DsButton>
      <span class="gks-tnum">{{ filters.page }} / {{ totalPages }}</span>
      <DsButton
        variant="ghost"
        size="sm"
        icon-right="chevron-right"
        :disabled="filters.page >= totalPages"
        @click="apply({ page: filters.page + 1 }, false)"
      >
        Дараах
      </DsButton>
    </nav>
  </div>
</template>

<style scoped>
.gks-adm { display: grid; gap: var(--sp-5); padding-block: var(--sp-6); }
.gks-adm__title { margin-top: var(--sp-2); font-size: clamp(26px, 3vw, var(--fs-h1)); font-weight: var(--fw-bold); }
.gks-adm__lede { max-width: 74ch; margin-top: var(--sp-3); color: var(--text-subtle); line-height: 1.6; }
.gks-adm__alert { display: inline-flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line-soft); border-radius: var(--radius-2); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-adm__alert strong { color: var(--text-body); }


.gks-adm__state { color: var(--text-subtle); }
.gks-adm__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--sp-4); list-style: none; }
.gks-adm__skeleton { height: 232px; border-radius: var(--radius-3); background: var(--n-100); animation: gks-adm-pulse 1.4s ease-in-out infinite; }
@keyframes gks-adm-pulse { 50% { opacity: .55; } }

.gks-adm-card { display: flex; flex-direction: column; gap: var(--sp-3); height: 100%; padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); }
.gks-adm-card__head { display: flex; align-items: flex-start; gap: var(--sp-3); }
.gks-adm-card__head > img { flex: none; width: 44px; height: 44px; object-fit: contain; }
.gks-adm-card__logo { display: grid; flex: none; place-items: center; width: 44px; height: 44px; border-radius: var(--radius-2); background: var(--n-100); color: var(--text-subtle); }
.gks-adm-card__identity { flex: 1; min-width: 0; }
.gks-adm-card__identity h2 { font-size: var(--fs-body); font-weight: var(--fw-semibold); }
.gks-adm-card__identity h2 a { color: inherit; }
.gks-adm-card__identity h2 a:hover { color: var(--brand-700); }
.gks-adm-card__identity p { margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-adm-card__term { color: var(--text-muted); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }

.gks-adm-card__dates { display: grid; gap: var(--sp-2); padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken, var(--n-050)); }
.gks-adm-card__dates > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.gks-adm-card__dates dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-adm-card__dates dd { font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
/* Ours is the date that matters; the school's is context. */
.gks-adm-card__dates > div:first-child dd { color: var(--brand-700); }

.gks-adm-card__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-top: auto; padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }
.gks-adm-card__cta { display: inline-flex; align-items: center; gap: 4px; color: var(--brand-700); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }

.gks-pager { display: flex; align-items: center; justify-content: center; gap: var(--sp-4); }

/* A phone gets to the first card sooner: a smaller headline, a tighter lede. */
@media (max-width: 640px) {
  .gks-adm { gap: var(--sp-4); padding-block: var(--sp-5); }
  .gks-adm__title { font-size: var(--fs-h2); }
  .gks-adm__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); }
  .gks-adm__alert { margin-top: var(--sp-3); }
  .gks-adm__grid { grid-template-columns: 1fr; }
}
</style>
