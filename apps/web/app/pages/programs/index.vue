<script setup lang="ts">
import type {
  InstructionLanguage,
  PaginatedResult,
  ProgramFacets,
  ProgramLevel,
  ProgramListItem,
} from '@gks/shared';

/**
 * The programme catalogue: every department, found by typing a word.
 *
 * One row is one department, and the search box is the way in — "IT",
 * "маркетинг", "경영", a school's name, a college's name. There is no subject
 * taxonomy behind it: what somebody types is matched against the names the
 * schools themselves publish, so nothing has to be filed under a vocabulary
 * we maintain (ARCHITECTURE.md §3.3).
 *
 * Ordered by our own recommendation by default, exactly like the university
 * catalogue — `gksRank` decides what a visitor sees first and never appears on
 * the card (ARCHITECTURE.md §3.1).
 *
 * Every price is shown with the year it was read off. Korean schools republish
 * their fee tables annually, so a figure with no year on it is unknown
 * provenance, not "current", and saying so here is what stops it being planned
 * around as this year's number.
 */
type Paginated = PaginatedResult<ProgramListItem>;

const router = useRouter();

const PAGE_SIZE = 20;
const SORTS: { value: string; label: string }[] = [
  { value: 'university', label: 'Санал болгох эрэмбээр' },
  { value: 'tuition:asc', label: 'Төлбөр — хямдаас' },
  { value: 'tuition:desc', label: 'Төлбөр — үнэтэйгээс' },
  { value: 'name', label: 'Нэрээр' },
];
const DEFAULT_SORT = 'university';

/** Round numbers a family actually budgets in, not an arbitrary slider. */
const TUITION_OPTIONS = [
  { value: '', label: 'Төлбөр хамаагүй' },
  { value: '4000000', label: 'Жилд ₩4 сая хүртэл' },
  { value: '6000000', label: 'Жилд ₩6 сая хүртэл' },
  { value: '8000000', label: 'Жилд ₩8 сая хүртэл' },
  { value: '10000000', label: 'Жилд ₩10 сая хүртэл' },
];
const TOPIK_OPTIONS = [
  { value: '', label: 'TOPIK хамаагүй' },
  ...[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `TOPIK ${value} ба доош` })),
];
/**
 * There is no "тэтгэлэггүй" option on purpose. A programme whose discount we
 * have not recorded is not a programme without one, and offering the inverse
 * would turn a gap in our data into a claim about a school.
 */
const SCHOLARSHIP_OPTIONS = [
  { value: '', label: 'Тэтгэлэг хамаагүй' },
  { value: 'true', label: 'Тэтгэлэгтэй нь' },
];

// The URL is the state: a search survives a reload and a shared link, which is
// how a consultant sends "these are your options" to a client.
const { str, num, apply, search } = useQueryState();

const filters = computed(() => ({
  q: str('q'),
  level: str('level') as ProgramLevel | '',
  university: str('university'),
  region: str('region'),
  language: str('language') as InstructionLanguage | '',
  tuitionMax: str('tuitionMax'),
  topikMax: str('topikMax'),
  scholarship: str('scholarship'),
  sort: str('sort', DEFAULT_SORT),
  page: num('page'),
}));

const searchInput = search();

/**
 * `Search` (1A-38) — what a visitor types is the clearest statement of intent
 * this site collects, and it is what a lookalike audience is worth building
 * on. Fired off the applied query, not the keystrokes: the URL only changes
 * once the 350ms debounce has settled.
 */
const meta = useMetaTracking();
watch(
  () => filters.value.q,
  (value) => {
    const term = value.trim();
    if (term.length >= 2) meta.track('Search', { search_string: term, content_category: 'program' });
  },
);


const query = computed(() => {
  const [sort, order] = filters.value.sort.split(':');
  return {
    page: filters.value.page,
    limit: PAGE_SIZE,
    sort,
    ...(order ? { order } : {}),
    ...(filters.value.q ? { q: filters.value.q } : {}),
    ...(filters.value.level ? { level: filters.value.level } : {}),
    ...(filters.value.university ? { university: filters.value.university } : {}),
    ...(filters.value.region ? { region: filters.value.region } : {}),
    ...(filters.value.language ? { language: filters.value.language } : {}),
    ...(filters.value.tuitionMax ? { tuitionMax: filters.value.tuitionMax } : {}),
    ...(filters.value.topikMax ? { topikMax: filters.value.topikMax } : {}),
    ...(filters.value.scholarship ? { scholarship: filters.value.scholarship } : {}),
  };
});

const { data, status, error } = await useApiFetch<Paginated>('/programs', { query, lazy: true });
const { data: facets } = await useApiFetch<ProgramFacets>('/programs/facets', { lazy: true });

const items = computed(() => data.value?.items ?? []);
const total = computed(() => data.value?.meta.total ?? 0);
const totalPages = computed(() => data.value?.meta.totalPages ?? 1);
const activeFilterCount = computed(() =>
  [
    filters.value.level,
    filters.value.university,
    filters.value.region,
    filters.value.language,
    filters.value.tuitionMax,
    filters.value.topikMax,
    filters.value.scholarship,
  ].filter(Boolean).length);

const levelOptions = computed(() => [
  { value: '', label: 'Бүх түвшин' },
  ...(facets.value?.levels ?? []).map((row) => ({
    value: row.value,
    label: `${PROGRAM_LEVEL_LABELS[row.value]} (${row.count})`,
  })),
]);

const universityOptions = computed(() => [
  { value: '', label: 'Бүх сургууль' },
  ...(facets.value?.universities ?? []).map((row) => ({ value: row.value, label: `${row.label} (${row.count})` })),
]);

const regionOptions = computed(() => [
  { value: '', label: 'Бүх бүс нутаг' },
  ...(facets.value?.regions ?? []).map((row) => ({ value: row.value, label: `${row.label} (${row.count})` })),
]);

const languageOptions = computed(() => [
  { value: '', label: 'Бүх хэл' },
  ...(facets.value?.languages ?? []).map((row) => ({
    value: row.value,
    label: `${INSTRUCTION_LANGUAGE_LABELS[row.value]} (${row.count})`,
  })),
]);

/**
 * The annual figure, worked out from a semester price when that is all the
 * school published. Returns the number, not a string: an unknown price is
 * rendered as "мэдээлэл шинэчлэгдэж байна" in the card's own muted style, never
 * as a confident-looking zero (CLAUDE.md).
 */
function annual(program: ProgramListItem): number | null {
  return annualTuitionKrw(program);
}

/** "Yonsei University · 공과대학 · Сөүл" — where this department actually is. */
function placeLine(program: ProgramListItem): string {
  return [program.faculty?.nameKo ?? program.faculty?.nameMn, universityPlace(program.university)]
    .filter(Boolean)
    .join(' · ');
}

useHead({ title: 'Солонгосын сургуулиудын ангиуд, сургалтын төлбөр' });
useSeoMeta({
  description:
    'Солонгосын их, дээд сургуулиудын гадаад оюутан элсдэг ангиуд — сургалтын төлбөр, TOPIK ' +
    'шаардлага, хичээлийн хэлийн хамт. Мэргэжлийнхээ нэрээр хайгаад харьцуулна уу.',
  ogTitle: 'Ангиуд, сургалтын төлбөр · GKS Edu',
  ogType: 'website',
});
// Filters are query strings on one page, not thousands of pages (`useSeo.ts`).
useListingSeo('/programs');
</script>

<template>
  <div class="gks-prog">
    <header class="gks-prog__head">
      <span class="gks-eyebrow">Ангиуд, сургалтын төлбөр</span>
      <h1 class="gks-prog__title">
        <template v-if="filters.q">«{{ filters.q }}» — {{ total }} анги</template>
        <template v-else>Ямар мэргэжлээр сурах вэ?</template>
      </h1>
      <p class="gks-prog__lede">
        Мэргэжлийнхээ нэрийг бичээд хайна уу — «IT», «маркетинг», «경영». Солонгосын
        сургуулиудын гадаад оюутан элсүүлдэг ангиуд төлбөр, шаардлагынх нь хамт гарч ирнэ.
      </p>
      <p v-if="facets?.tuition.avgKrw" class="gks-prog__stat">
        <DsIcon name="wallet" :size="16" />
        Жилийн дундаж төлбөр
        <strong class="gks-tnum">{{ formatKrw(facets.tuition.avgKrw) }}</strong>
        <span v-if="facets.tuition.minKrw && facets.tuition.maxKrw">
          ({{ formatKrwRange(facets.tuition.minKrw, facets.tuition.maxKrw) }})
        </span>
      </p>
    </header>

    <CatalogFilterBar
      v-model:search="searchInput"
      search-placeholder="Мэргэжил, анги, сургуулийн нэрээр хайх"
      search-label="Мэргэжил, анги, сургуулийн нэрээр хайх"
      :active-count="activeFilterCount"
      :count="total"
      count-noun="анги"
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
        :model-value="filters.university"
        :options="universityOptions"
        aria-label="Сургууль"
        @update:model-value="apply({ university: String($event) })"
      />
      <DsSelect
        :model-value="filters.region"
        :options="regionOptions"
        aria-label="Бүс нутаг"
        @update:model-value="apply({ region: String($event) })"
      />
      <DsSelect
        :model-value="filters.language"
        :options="languageOptions"
        aria-label="Хичээлийн хэл"
        @update:model-value="apply({ language: String($event) })"
      />
      <DsSelect
        :model-value="filters.tuitionMax"
        :options="TUITION_OPTIONS"
        aria-label="Төлбөрийн дээд хязгаар"
        @update:model-value="apply({ tuitionMax: String($event) })"
      />
      <DsSelect
        :model-value="filters.scholarship"
        :options="SCHOLARSHIP_OPTIONS"
        aria-label="Тэтгэлэг"
        @update:model-value="apply({ scholarship: String($event) })"
      />
      <DsSelect
        :model-value="filters.topikMax"
        :options="TOPIK_OPTIONS"
        aria-label="TOPIK шаардлага"
        @update:model-value="apply({ topikMax: String($event) })"
      />
      <DsSelect
        :model-value="filters.sort"
        :options="SORTS"
        aria-label="Эрэмбэ"
        @update:model-value="apply({ sort: String($event) })"
      />
    </CatalogFilterBar>

    <DsCard v-if="error" accent class="gks-prog__state">
      Ангиудын мэдээллийг ачаалахад алдаа гарлаа. Хуудсаа дахин ачаална уу.
    </DsCard>

    <div v-else-if="status === 'pending' && !items.length" class="gks-prog__grid">
      <div v-for="n in 6" :key="n" class="gks-prog__skeleton" />
    </div>

    <DsCard v-else-if="!items.length" class="gks-prog__state">
      <template v-if="filters.q">«{{ filters.q }}» гэсэн хайлтад тохирох анги олдсонгүй.</template>
      <template v-else>Энэ шүүлтүүрт тохирох анги олдсонгүй.</template>
      Өөр үгээр хайж үзээрэй, эсвэл
      <NuxtLink to="/consultation">зөвлөгөө авах хүсэлт</NuxtLink> илгээгээрэй — бид тухайн
      мэргэжлээр аль сургуульд сурч болохыг тодруулж өгнө.
    </DsCard>

    <ul v-else class="gks-prog__grid">
      <li v-for="program in items" :key="program.id">
        <article class="gks-prog-card">
          <!-- What this is: level and length, as chips, so the name below is
               free to be the only headline. -->
          <div class="gks-prog-card__chips">
            <span class="gks-prog-card__chip">{{ PROGRAM_LEVEL_LABELS[program.level] }}</span>
            <span v-if="program.durationYears" class="gks-prog-card__chip">
              {{ program.durationYears }} жил
            </span>
          </div>

          <h2 class="gks-prog-card__name">
            <NuxtLink :to="`/universities/${program.university.slug}`">{{ program.nameMn }}</NuxtLink>
          </h2>
          <p v-if="program.nameKo || program.nameEn" class="gks-prog-card__native">
            {{ program.nameKo ?? program.nameEn }}
          </p>

          <!-- Сургууль → танхим → анги: the two levels above this row, in one line. -->
          <div class="gks-prog-card__school">
            <img
              v-if="program.university.logoPath"
              :src="program.university.logoPath"
              :alt="`${program.university.nameEn} лого`"
              loading="lazy"
              width="32"
              height="32"
            >
            <span v-else class="gks-prog-card__logo gks-prog-card__logo--empty" aria-hidden="true">
              <DsIcon name="landmark" :size="16" />
            </span>
            <span>
              <strong>{{ program.university.nameEn }}</strong>
              <small>{{ placeLine(program) }}</small>
            </span>
          </div>

          <!-- The number the page exists for, given its own ground. -->
          <div class="gks-prog-card__price">
            <span class="gks-prog-card__price-label">Жилийн сургалтын төлбөр</span>
            <strong v-if="annual(program) !== null" class="gks-prog-card__price-value">
              {{ formatKrw(annual(program)) }}
            </strong>
            <strong v-else class="gks-prog-card__price-value gks-prog-card__unknown">
              Мэдээлэл шинэчлэгдэж байна
            </strong>
            <span v-if="program.tuitionPerTermKrw" class="gks-prog-card__price-term">
              Нэг улирал {{ formatKrw(program.tuitionPerTermKrw) }} · {{ tuitionTermsNote(program.level) }}
            </span>
          </div>

          <!-- Label left, value right: the spec-sheet idiom the catalogue card
               uses, so every number says what it is. -->
          <dl class="gks-prog-card__facts">
            <div>
              <dt>Элсэлтийн хураамж</dt>
              <dd :class="{ 'gks-prog-card__unknown': program.admissionFeeKrw === null }">
                {{ formatKrw(program.admissionFeeKrw) ?? '—' }}
              </dd>
            </div>
            <div>
              <dt>TOPIK шаардлага</dt>
              <dd :class="{ 'gks-prog-card__unknown': program.topikLevel === null }">
                {{ program.topikLevel === null ? 'Заагаагүй' : `${program.topikLevel} түвшин` }}
              </dd>
            </div>
            <div>
              <dt>Хичээлийн хэл</dt>
              <dd>{{ INSTRUCTION_LANGUAGE_LABELS[program.language] }}</dd>
            </div>
          </dl>

          <p v-if="program.scholarshipMaxPercent" class="gks-prog-card__scholarship">
            <DsIcon name="badge-percent" :size="15" />
            Гадаад оюутанд <strong>{{ program.scholarshipMaxPercent }}% хүртэл</strong> хөнгөлөлт
            <span v-if="program.scholarshipNote">— {{ program.scholarshipNote }}</span>
          </p>

          <!-- No `tuitionYear`: which year's fee table a figure came from is a
               staff signal (the admin list sorts and flags on it), and to a
               visitor a missing one printed "Он тодорхойгүй". -->
          <footer class="gks-prog-card__foot">
            <NuxtLink :to="`/universities/${program.university.slug}`">
              Сургуулийн мэдээлэл <DsIcon name="arrow-right" :size="14" />
            </NuxtLink>
          </footer>
        </article>
      </li>
    </ul>

    <DsPager :page="filters.page" :total-pages="totalPages" variant="ghost" @update:page="apply({ page: $event }, false)" />
  </div>
</template>

<style scoped>
.gks-prog { display: grid; gap: var(--sp-5); max-width: 1180px; margin-inline: auto; padding: var(--sp-6) var(--sp-4) var(--sp-8); }
.gks-prog__title { margin-top: var(--sp-2); font-size: var(--fs-h1); font-weight: var(--fw-bold); }
.gks-prog__lede { max-width: 62ch; margin-top: var(--sp-3); color: var(--text-muted); line-height: 1.7; }
.gks-prog__stat { display: inline-flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); padding: var(--sp-2) var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-prog__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: var(--sp-4); list-style: none; }
.gks-prog__skeleton { height: 320px; border-radius: var(--radius-1); background: var(--surface-sunken); }
.gks-prog__state { text-align: center; }
.gks-prog-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  height: 100%;
  padding: var(--sp-5);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-1);
  transition: var(--transition-control);
}
.gks-prog-card:hover { border-color: var(--line-ink); box-shadow: var(--shadow-raised); }

/* Level and length, in the same tiny-caps chip the catalogue card uses. */
.gks-prog-card__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.gks-prog-card__chip {
  display: inline-flex;
  padding: 2px 6px;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-subtle);
  font-size: 9px;
  font-weight: var(--fw-bold);
  line-height: 1.2;
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
}

.gks-prog-card__name {
  margin-top: calc(var(--sp-1) * -1);
  font-family: var(--font-display);
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  line-height: var(--lh-snug);
  letter-spacing: var(--ls-heading);
  color: var(--text-strong);
}
.gks-prog-card__name a { color: inherit; text-decoration: none; }
.gks-prog-card__name a:hover { color: var(--text-link-hover); }
.gks-prog-card__native { margin-top: calc(var(--sp-3) * -1 + 2px); color: var(--text-subtle); font-size: var(--fs-caption); }

/* The school and the college it sits in: the address of this row. */
.gks-prog-card__school { display: flex; align-items: center; gap: var(--sp-3); }
.gks-prog-card__school img,
.gks-prog-card__logo {
  width: 32px;
  height: 32px;
  flex: none;
  object-fit: contain;
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  padding: 2px;
}
.gks-prog-card__logo--empty { display: grid; place-items: center; color: var(--text-subtle); }
.gks-prog-card__school > span { min-width: 0; }
.gks-prog-card__school strong {
  display: block;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-snug);
  color: var(--text-body);
}
.gks-prog-card__school small { display: block; margin-top: 1px; color: var(--text-subtle); font-size: var(--fs-caption); }

/* The number the page exists for, on its own ground so it cannot be mistaken
   for one of the spec rows below it. */
.gks-prog-card__price {
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-1);
  background: var(--surface-brand-soft);
}
.gks-prog-card__price-label {
  display: block;
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
}
.gks-prog-card__price-value {
  display: block;
  margin-top: 2px;
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  font-variant-numeric: var(--num-tabular);
  line-height: var(--lh-snug);
  color: var(--brand-700);
}
.gks-prog-card__price-term {
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-variant-numeric: var(--num-tabular);
}

/* Label left, value right — the catalogue card's spec sheet. */
.gks-prog-card__facts { display: grid; gap: var(--sp-2); }
.gks-prog-card__facts > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-3);
}
.gks-prog-card__facts dt { flex: none; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-prog-card__facts dd {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  font-variant-numeric: var(--num-tabular);
  color: var(--text-body);
  text-align: right;
}
.gks-prog-card__unknown { font-weight: var(--fw-regular); color: var(--text-disabled); }

/* Good news, so it reads as good news — and a sentence, so it flows as one.
   `display: flex` here turned each run of text into its own column. */
.gks-prog-card__scholarship {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-1);
  background: var(--green-050);
  color: var(--green-700);
  font-size: var(--fs-caption);
  line-height: var(--lh-loose);
}
.gks-prog-card__scholarship strong { font-weight: var(--fw-bold); }
.gks-prog-card__scholarship .gks-icon { margin-right: 4px; vertical-align: -3px; }

.gks-prog-card__foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-3);
  margin-top: auto;
  padding-top: var(--sp-3);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.gks-prog-card__foot a {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-link);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}
.gks-prog-card__foot a:hover { color: var(--text-link-hover); }

/* A phone gets to the first card sooner: a smaller headline, a tighter lede. */
@media (max-width: 640px) {
  .gks-prog { gap: var(--sp-4); padding: var(--sp-5) var(--sp-4) var(--sp-7); }
  .gks-prog__title { font-size: var(--fs-h2); }
  .gks-prog__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); line-height: 1.6; }
  /* Label, then figure: squeezed into one row the label wrapped mid-phrase. */
  .gks-prog__stat { flex-wrap: wrap; margin-top: var(--sp-3); font-size: var(--fs-caption); }
  .gks-prog__grid { grid-template-columns: 1fr; }
}
</style>
