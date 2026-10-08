<script setup lang="ts">
import type { AdmissionListItem, PaginatedResult, ProgramLevel, ProgramListItem } from '@gks/shared';

/**
 * The part of a service page that is read off the catalogue rather than typed:
 * the rounds a visitor can still join, what the programmes cost and what a
 * foreign student can realistically save, and the schools behind them.
 *
 * Everything is public endpoints the catalogue pages already use — no new API.
 * A block with nothing to show disappears, so a level the office has not
 * researched yet reads as a shorter page, never as a row of dashes.
 * Deadlines are our internal ones (`internalDeadline`), the only date a visitor
 * is ever shown (CLAUDE.md).
 */
const props = defineProps<{
  /** One level, or two for the graduate page (master / doctor) — then a switch appears. */
  levels: ProgramLevel[];
}>();

const active = ref<ProgramLevel>(props.levels[0]!);

const admissionQuery = computed(() => ({ level: active.value, limit: 4, sort: 'deadline' }));
const programQuery = computed(() => ({ level: active.value, limit: 6, sort: 'tuition', order: 'asc' }));

const { data: admissions } = await useApiFetch<PaginatedResult<AdmissionListItem>>('/admissions', {
  query: admissionQuery,
  lazy: true,
});
const { data: programs } = await useApiFetch<PaginatedResult<ProgramListItem>>('/programs', {
  query: programQuery,
  lazy: true,
});

const rounds = computed(() => admissions.value?.items ?? []);
const roundTotal = computed(() => admissions.value?.meta.total ?? 0);
const programRows = computed(() => programs.value?.items ?? []);
const programTotal = computed(() => programs.value?.meta.total ?? 0);

const cheapest = computed(() => {
  const prices = programRows.value
    .map((row) => annualTuitionKrw(row))
    .filter((value): value is number => value !== null);
  return prices.length ? Math.min(...prices) : null;
});

const maxScholarship = computed(() => {
  const values = programRows.value.map((row) => row.scholarshipMaxPercent ?? 0);
  return values.length ? Math.max(...values) : 0;
});

/** Distinct schools across the cards on screen — a taste, with the full list one click away. */
const schools = computed(() => {
  const seen = new Map<string, ProgramListItem['university']>();
  for (const row of programRows.value) seen.set(row.university.id, row.university);
  for (const round of rounds.value) {
    if (!seen.has(round.university.id)) seen.set(round.university.id, round.university);
  }
  return [...seen.values()].slice(0, 6);
});

const levelLabel = computed(() => PROGRAM_LEVEL_LABELS[active.value]);
const hasAnything = computed(() => roundTotal.value > 0 || programTotal.value > 0);
</script>

<template>
  <section v-if="hasAnything || levels.length > 1" class="live" aria-labelledby="live-title">
    <header class="live__head">
      <div>
        <h2 id="live-title" class="live__h2">Одоо нээлттэй байгаа боломжууд</h2>
        <p class="live__sub">Сургуулиудын бодит элсэлт, төлбөр, тэтгэлгийн мэдээлэл — өдөр бүр шинэчлэгдэнэ.</p>
      </div>
      <div v-if="levels.length > 1" class="live__tabs" role="tablist" aria-label="Түвшин">
        <button
          v-for="level in levels"
          :key="level"
          type="button"
          role="tab"
          class="live__tab"
          :class="{ 'live__tab--on': level === active }"
          :aria-selected="level === active"
          @click="active = level"
        >
          {{ PROGRAM_LEVEL_LABELS[level] }}
        </button>
      </div>
    </header>

    <dl class="live__stats">
      <div v-if="roundTotal">
        <dt>Нээлттэй элсэлт</dt>
        <dd class="gks-tnum">{{ roundTotal }}</dd>
      </div>
      <div v-if="programTotal">
        <dt>Хөтөлбөр</dt>
        <dd class="gks-tnum">{{ programTotal }}</dd>
      </div>
      <div v-if="cheapest">
        <dt>Жилийн төлбөр (эхлэх)</dt>
        <dd class="gks-tnum">{{ formatKrw(cheapest) }}</dd>
      </div>
      <div v-if="maxScholarship">
        <dt>Хөнгөлөлт (хамгийн их)</dt>
        <dd class="gks-tnum">{{ maxScholarship }}%</dd>
      </div>
    </dl>

    <!-- Rounds -->
    <div v-if="rounds.length" class="live__block">
      <div class="live__block-head">
        <h3>Ойрын элсэлтүүд</h3>
        <NuxtLink :to="{ path: '/admissions', query: { level: active } }">
          Бүгдийг харах ({{ roundTotal }}) <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
      <ul class="live__cards">
        <li v-for="round in rounds" :key="round.id" class="live__card">
          <div class="live__school">
            <img v-if="round.university.logoPath" :src="round.university.logoPath" :alt="`${round.university.nameEn} лого`" width="36" height="36">
            <span v-else class="live__logo" aria-hidden="true"><DsIcon name="landmark" :size="18" /></span>
            <div>
              <NuxtLink :to="`/universities/${round.university.slug}`" class="live__school-name">{{ round.university.nameEn }}</NuxtLink>
              <p>{{ round.university.cityMn }} · {{ round.year }} оны {{ INTAKE_MONTH_LABELS[round.month] ?? `${round.month}-р сар` }}</p>
            </div>
          </div>
          <div class="live__card-foot">
            <span>
              Бүртгэл дуусах
              <strong class="gks-tnum">{{ formatNumericDateUtc(round.internalDeadline) }}</strong>
            </span>
            <DsBadge :tone="deadlineCountdownTone(round.daysUntilInternalDeadline)">
              {{ deadlineCountdownLabel(round.daysUntilInternalDeadline) }}
            </DsBadge>
          </div>
        </li>
      </ul>
    </div>

    <!-- Programmes + tuition + scholarship -->
    <div v-if="programRows.length" class="live__block">
      <div class="live__block-head">
        <h3>{{ levelLabel }} — хамгийн боломжийн төлбөртэй хөтөлбөрүүд</h3>
        <NuxtLink :to="{ path: '/programs', query: { level: active } }">
          Бүх хөтөлбөр ({{ programTotal }}) <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
      <ul class="live__cards">
        <li v-for="row in programRows" :key="row.id" class="live__card">
          <div>
            <p class="live__prog-name">{{ row.nameMn }}</p>
            <p class="live__prog-meta">
              <NuxtLink :to="`/universities/${row.university.slug}`">{{ row.university.nameEn }}</NuxtLink>
              <template v-if="row.faculty"> · {{ row.faculty.nameMn }}</template>
            </p>
          </div>
          <dl class="live__facts">
            <div>
              <dt>Жилийн төлбөр</dt>
              <dd class="gks-tnum">
                {{ formatKrw(annualTuitionKrw(row)) ?? 'мэдээлэл шинэчлэгдэж байна' }}
                <small v-if="annualTuitionKrw(row)">{{ tuitionTermsNote(row.level) }}</small>
              </dd>
            </div>
            <div v-if="row.topikLevel">
              <dt>TOPIK</dt>
              <dd class="gks-tnum">{{ row.topikLevel }}+</dd>
            </div>
            <div v-if="row.scholarshipMaxPercent">
              <dt>Хөнгөлөлт</dt>
              <dd class="gks-tnum">{{ row.scholarshipMaxPercent }}% хүртэл</dd>
            </div>
          </dl>
          <p v-if="row.scholarshipNote" class="live__note">{{ row.scholarshipNote }}</p>
        </li>
      </ul>
      <p class="live__foot">
        Төлбөр нь сургуулийн нийтэлсэн үнэ (улирлаар). Бодит төлөх дүн тэтгэлэг, хөнгөлөлтөөс хамаарна —
        зөвлөх тантай нарийвчилна.
      </p>
    </div>

    <!-- Schools -->
    <div v-if="schools.length" class="live__block">
      <div class="live__block-head">
        <h3>Зуучилдаг сургуулиуд</h3>
        <NuxtLink :to="'/universities'">
          Бүх сургууль <DsIcon name="arrow-right" :size="14" />
        </NuxtLink>
      </div>
      <ul class="live__chips">
        <li v-for="school in schools" :key="school.id">
          <NuxtLink :to="`/universities/${school.slug}`" class="live__chip">
            <img v-if="school.logoPath" :src="school.logoPath" :alt="`${school.nameEn} лого`" width="24" height="24">
            <span>{{ school.nameEn }}</span>
            <small>{{ school.cityMn }}</small>
          </NuxtLink>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.live { display: flex; flex-direction: column; gap: var(--sp-6); }
.live__head { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
.live__h2 { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); }
.live__sub { margin-top: var(--sp-1); color: var(--text-subtle); font-size: var(--fs-body-sm); }

.live__tabs { display: inline-flex; padding: 3px; border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); }
.live__tab { padding: var(--sp-2) var(--sp-4); border: 0; border-radius: var(--radius-2); background: transparent; color: var(--text-subtle); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); cursor: pointer; }
.live__tab--on { background: var(--brand-600, #1f4e9c); color: #fff; }

.live__stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-3); margin: 0; }
.live__stats > div { padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); }
.live__stats dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.live__stats dd { margin: var(--sp-1) 0 0; font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-black); }

.live__block { display: flex; flex-direction: column; gap: var(--sp-3); }
.live__block-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
.live__block-head h3 { font-size: var(--fs-body); font-weight: var(--fw-semibold); }
.live__block-head a { display: inline-flex; align-items: center; gap: 4px; color: var(--brand-700); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }

.live__cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--sp-3); }
.live__card { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); }
.live__school { display: flex; gap: var(--sp-3); align-items: center; }
.live__school img, .live__logo { flex: none; width: 36px; height: 36px; object-fit: contain; }
.live__logo { display: grid; place-items: center; border-radius: var(--radius-2); background: var(--n-100); color: var(--text-subtle); }
.live__school-name { color: inherit; font-weight: var(--fw-semibold); }
.live__school-name:hover { color: var(--brand-700); }
.live__school p { color: var(--text-subtle); font-size: var(--fs-caption); }
.live__card-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-top: auto; padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); color: var(--text-subtle); font-size: var(--fs-caption); }
.live__card-foot strong { margin-left: 4px; color: var(--brand-700); }

.live__prog-name { font-weight: var(--fw-semibold); }
.live__prog-meta { color: var(--text-subtle); font-size: var(--fs-caption); }
.live__prog-meta a { color: inherit; }
.live__prog-meta a:hover { color: var(--brand-700); }
.live__facts { display: grid; gap: var(--sp-2); margin: 0; padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken, var(--n-050)); }
.live__facts > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-3); }
.live__facts dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.live__facts dd { margin: 0; font-size: var(--fs-caption); font-weight: var(--fw-semibold); text-align: right; }
.live__facts small { display: block; color: var(--text-subtle); font-weight: var(--fw-regular, 400); }
.live__note { color: var(--text-subtle); font-size: var(--fs-caption); }
.live__foot { color: var(--text-subtle); font-size: var(--fs-caption); }

.live__chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.live__chip { display: inline-flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line-soft); border-radius: 999px; background: var(--surface-card); color: var(--text-body); font-size: var(--fs-body-sm); }
.live__chip:hover { border-color: var(--brand-600); }
.live__chip small { color: var(--text-subtle); }

@media (max-width: 640px) {
  .live__cards { grid-template-columns: 1fr; }
}
</style>
