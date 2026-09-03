<script setup lang="ts">
/**
 * One "label → value" row where the value may be genuinely unknown.
 *
 * The dataset leaves dormitory prices, international-student counts and transit
 * details unfilled on purpose, so a missing value is stated as such rather than
 * shown as 0 or an empty cell (CLAUDE.md, 1A-08).
 */
defineProps<{
  label: string;
  /** Already-formatted value; null/undefined/'' renders the "updating" note. */
  value?: string | number | null;
  /** Where the value came from, e.g. "wikidata" — from the record's quality block. */
  source?: string | null;
}>();
</script>

<template>
  <div class="gks-datum">
    <dt class="gks-datum__label">{{ label }}</dt>
    <dd v-if="value !== null && value !== undefined && value !== ''" class="gks-datum__value">
      <span class="gks-tnum">{{ value }}</span>
      <CommonQualityBadge v-if="source" :source="source" />
    </dd>
    <dd v-else class="gks-datum__value gks-datum__value--unknown">{{ UNKNOWN_LABEL }}</dd>
  </div>
</template>

<style scoped>
.gks-datum {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-2) var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-datum:last-child { border-bottom: 0; }
.gks-datum__label { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-datum__value {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  text-align: right;
}
.gks-datum__value--unknown {
  font-weight: var(--fw-regular);
  font-style: italic;
  color: var(--text-subtle);
}
</style>
