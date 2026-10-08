<script setup lang="ts">
import type { CatalogueCheck, CatalogueGapState } from '@gks/shared';

/**
 * 1A-43 — the buckets of one check as tiles that double as the filter.
 *
 * Only the buckets the check can produce are drawn (`CATALOGUE_GAP_LABELS`),
 * in the order a person works them: done, then the gaps worst-last.
 */
const props = defineProps<{
  check: CatalogueCheck;
  counts: Record<CatalogueGapState, number>;
  total: number;
}>();

const selected = defineModel<CatalogueGapState | ''>({ required: true });

const ORDER: CatalogueGapState[] = ['COMPLETE', 'PARTIAL', 'NOT_FOUND', 'MISSING', 'NO_BASE'];

const tiles = computed(() =>
  ORDER.filter((state) => CATALOGUE_GAP_LABELS[props.check][state]).map((state) => ({
    state,
    label: CATALOGUE_GAP_LABELS[props.check][state]!,
    count: props.counts[state],
    tone: CATALOGUE_GAP_TONES[state],
  })),
);

function pick(state: CatalogueGapState | '') {
  selected.value = selected.value === state ? '' : state;
}
</script>

<template>
  <div class="cp-tiles" role="group" aria-label="Ангилал">
    <button
      type="button"
      class="cp-tile"
      :class="{ 'cp-tile--active': selected === '' }"
      :aria-pressed="selected === ''"
      @click="selected = ''"
    >
      <strong class="gks-tnum">{{ total }}</strong>
      <span>Бүх сургууль</span>
    </button>
    <button
      v-for="tile in tiles"
      :key="tile.state"
      type="button"
      class="cp-tile"
      :class="[`cp-tile--${tile.tone}`, { 'cp-tile--active': selected === tile.state }]"
      :aria-pressed="selected === tile.state"
      :disabled="!tile.count"
      @click="pick(tile.state)"
    >
      <strong class="gks-tnum">{{ tile.count }}</strong>
      <span>{{ tile.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.cp-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-3); }
.cp-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: var(--sp-3) var(--sp-4);
  border: 2px solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.12s, box-shadow 0.12s;
}
.cp-tile strong { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); line-height: 1.1; }
.cp-tile span { font-size: var(--fs-caption); color: var(--text-subtle); }
.cp-tile:hover:not(:disabled) { border-color: var(--line-strong); }
.cp-tile:disabled { cursor: default; opacity: 0.55; }
.cp-tile--success strong { color: var(--success-fg); }
.cp-tile--warning strong { color: var(--warning-fg); }
.cp-tile--danger strong { color: var(--danger-fg); }
.cp-tile--info strong { color: var(--info-fg); }
.cp-tile--active { border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-100); }
.cp-tile--success.cp-tile--active { border-color: var(--success-fg); background: var(--success-bg); }
.cp-tile--warning.cp-tile--active { border-color: var(--warning-fg); background: var(--warning-bg); }
.cp-tile--danger.cp-tile--active { border-color: var(--danger-fg); background: var(--danger-bg); }
.cp-tile--info.cp-tile--active { border-color: var(--info-fg); background: var(--info-bg); }
</style>
