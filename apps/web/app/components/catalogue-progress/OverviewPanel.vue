<script setup lang="ts">
import type { CatalogueCheck, CatalogueGapState, CatalogueProgressSummary } from '@gks/shared';

/**
 * 1A-43 — the first tab: one card per kind of data, each a single bar of how
 * the 135 schools split, and a click through to that kind's own tab.
 */
const props = defineProps<{ summary: CatalogueProgressSummary }>();
const emit = defineEmits<{ open: [check: CatalogueCheck] }>();

const CHECKS: CatalogueCheck[] = ['intakes', 'programs', 'faculties', 'tuition', 'scholarship'];
const ORDER: CatalogueGapState[] = ['COMPLETE', 'PARTIAL', 'NOT_FOUND', 'MISSING', 'NO_BASE'];

const cards = computed(() =>
  CHECKS.map((check) => {
    const counts = props.summary.states[check];
    return {
      check,
      label: CATALOGUE_CHECK_LABELS[check],
      complete: counts.COMPLETE,
      segments: ORDER.filter((state) => counts[state] > 0).map((state) => ({
        state,
        count: counts[state],
        label: CATALOGUE_GAP_LABELS[check][state] ?? state,
        width: `${(counts[state] / Math.max(1, props.summary.schools)) * 100}%`,
      })),
    };
  }),
);
</script>

<template>
  <div class="cp-overview">
    <section class="gks-stats" aria-label="Тойм">
      <div class="gks-stat">
        <span>Нийт сургууль</span><strong class="gks-tnum">{{ summary.schools }}</strong>
      </div>
      <div class="gks-stat gks-stat--success">
        <span>Бүх мэдээлэл бүрэн</span><strong class="gks-tnum">{{ summary.byStatus.DONE }}</strong>
      </div>
      <div class="gks-stat">
        <span>Ирэх элсэлт</span><strong class="gks-tnum">{{ summary.intakes.upcoming }}</strong>
      </div>
      <div class="gks-stat">
        <span>Нийт анги</span><strong class="gks-tnum">{{ summary.programs.total }}</strong>
      </div>
      <div class="gks-stat">
        <span>Дундаж бүрэн байдал</span><strong class="gks-tnum">{{ summary.averagePercent }}%</strong>
      </div>
    </section>

    <div class="cp-cards">
      <button v-for="card in cards" :key="card.check" type="button" class="cp-card" @click="emit('open', card.check)">
        <span class="cp-card__head">
          <span class="cp-card__title">{{ card.label }}</span>
          <span class="cp-card__count gks-tnum">
            <strong>{{ card.complete }}</strong> / {{ summary.schools }} бүрэн
          </span>
        </span>
        <span class="cp-card__bar">
          <span
            v-for="segment in card.segments"
            :key="segment.state"
            class="cp-card__seg"
            :class="`cp-card__seg--${segment.state}`"
            :style="{ width: segment.width }"
            :title="`${segment.label}: ${segment.count}`"
          />
        </span>
        <span class="cp-card__legend">
          <span v-for="segment in card.segments" :key="segment.state" class="cp-card__item">
            <i :class="`cp-card__dot cp-card__seg--${segment.state}`" />
            {{ segment.label }} <strong class="gks-tnum">{{ segment.count }}</strong>
          </span>
        </span>
        <span class="cp-card__more">Дэлгэрэнгүй <DsIcon name="arrow-right" :size="14" /></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.cp-overview { display: flex; flex-direction: column; gap: var(--sp-4); }
.cp-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--sp-4); }
.cp-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s;
}
.cp-card:hover { border-color: var(--brand-600); }
.cp-card__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); }
.cp-card__title { font-family: var(--font-display); font-size: var(--fs-body-lg); font-weight: var(--fw-bold); color: var(--text-strong); }
.cp-card__count { font-size: var(--fs-caption); color: var(--text-subtle); }
.cp-card__count strong { font-size: var(--fs-body-lg); color: var(--success-fg); }
.cp-card__bar { display: flex; height: 12px; border-radius: var(--radius-pill); overflow: hidden; background: var(--line-hairline); }
.cp-card__seg { display: block; height: 100%; }
.cp-card__seg--COMPLETE { background: var(--success-fg); }
.cp-card__seg--PARTIAL { background: var(--warning-fg); }
.cp-card__seg--NOT_FOUND { background: var(--info-fg); }
.cp-card__seg--MISSING { background: var(--danger-fg); }
.cp-card__seg--NO_BASE { background: var(--line-strong); }
.cp-card__legend { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); font-size: var(--fs-caption); color: var(--text-subtle); }
.cp-card__item { display: inline-flex; align-items: center; gap: 6px; }
.cp-card__item strong { color: var(--text-strong); }
.cp-card__dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.cp-card__more { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-caption); font-weight: var(--fw-medium); color: var(--brand-700); }
</style>
