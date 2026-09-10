<script setup lang="ts">
import type { ReportMetric } from '@gks/shared';

/**
 * One flow figure with the same figure one period earlier under it.
 *
 * The comparison is the point of the tile: "3.4 сая₮" is a number, "3.4 сая₮,
 * өнгөрсөн сараас 18% дээш" is a decision. `higherIsBetter` exists because the
 * arrow's colour cannot be read off its direction — refunds and overdue debt
 * both go up in the wrong direction.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    metric: ReportMetric;
    /** Renders the value; defaults to a grouped number. */
    format?: (value: number) => string;
    higherIsBetter?: boolean;
  }>(),
  { higherIsBetter: true },
);

const render = (value: number) => props.format?.(value) ?? formatNumber(value) ?? '0';
const change = computed(() => describeChange(props.metric, props.higherIsBetter));
const ARROWS = { up: 'trending-up', down: 'trending-down', flat: 'minus' } as const;
</script>

<template>
  <div class="gks-stat">
    <span class="gks-stat__label">{{ label }}</span>
    <span class="gks-stat__value gks-tnum">{{ render(metric.value) }}</span>
    <span class="gks-metric__change" :class="`gks-metric__change--${change.tone}`">
      <DsIcon :name="ARROWS[change.direction]" :size="14" />
      <span class="gks-tnum">{{ change.text }}</span>
      <span class="gks-metric__prev gks-tnum">({{ render(metric.previous) }})</span>
    </span>
  </div>
</template>

<style scoped>
.gks-metric__change { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-micro); }
.gks-metric__change--good { color: var(--success-fg); }
.gks-metric__change--bad { color: var(--danger-fg); }
.gks-metric__change--neutral { color: var(--text-subtle); }
.gks-metric__prev { color: var(--text-subtle); }
</style>
