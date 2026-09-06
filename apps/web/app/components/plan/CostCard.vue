<script setup lang="ts">
import type { StudyPlanCost } from '@gks/shared';

/**
 * What the first year in Korea costs.
 *
 * Totalled in ₮ because that is what the family pays and thinks in, with the ₩
 * kept beside every Korean line so the figure can be checked against the
 * school's own page. Two things are stated rather than implied: the living-cost
 * line is a regional estimate, and a line we have no figure for shows as
 * unknown instead of as zero — a plan built on a confident zero is the one that
 * falls apart at the airport.
 */
defineProps<{ cost: StudyPlanCost; stageTitle: string }>();
</script>

<template>
  <section class="gks-cost">
    <header class="gks-cost__head">
      <div>
        <span class="gks-eyebrow">{{ stageTitle }} — эхний жил</span>
        <strong v-if="cost.totalMinMnt !== null" class="gks-cost__total gks-tnum">
          {{ formatMntMillions(cost.totalMinMnt, cost.totalMaxMnt) }}
        </strong>
        <strong v-else class="gks-cost__total gks-cost__unknown">{{ UNKNOWN_LABEL }}</strong>
      </div>
      <p class="gks-cost__fx">
        Ойролцоо тооцоо · ₩1 = {{ cost.krwToMnt.toFixed(2) }}₮
      </p>
    </header>

    <ul class="gks-cost__rows">
      <li v-for="item in cost.items" :key="item.key" class="gks-cost__row">
        <div class="gks-cost__label">
          <span>
            {{ item.labelMn }}
            <DsBadge v-if="item.isEstimate" tone="neutral">тооцоо</DsBadge>
          </span>
          <small v-if="item.noteMn">{{ item.noteMn }}</small>
        </div>
        <div class="gks-cost__value">
          <strong v-if="item.minMnt !== null" class="gks-tnum">
            {{ formatMntRange(item.minMnt, item.maxMnt) }}
          </strong>
          <strong v-else class="gks-cost__unknown">{{ UNKNOWN_LABEL }}</strong>
          <small v-if="item.minKrw !== null" class="gks-tnum">
            {{ formatKrwRange(item.minKrw, item.maxKrw) }}
          </small>
        </div>
      </li>
    </ul>

    <p v-if="cost.nextStage" class="gks-cost__next">
      <DsIcon name="arrow-right" :size="15" />
      Дараа нь {{ cost.nextStage.titleMn }} —
      <strong v-if="cost.nextStage.minKrw !== null" class="gks-tnum">
        {{ formatKrwRange(cost.nextStage.minKrw, cost.nextStage.maxKrw) }}
      </strong>
      <span v-else class="gks-cost__unknown">{{ UNKNOWN_LABEL }}</span>
      <span v-if="cost.nextStage.minKrw !== null">жилд</span>
    </p>
  </section>
</template>

<style scoped>
.gks-cost {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

.gks-cost__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--sp-3);
}

.gks-cost__total {
  display: block;
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  letter-spacing: var(--ls-heading);
  color: var(--text-strong);
  margin-top: var(--sp-1);
}

.gks-cost__fx {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  margin: 0;
}

.gks-cost__rows {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.gks-cost__row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-top: var(--border-hair) solid var(--line-soft);
}

.gks-cost__label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gks-cost__label > span {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-weight: var(--fw-medium);
}

.gks-cost__label small,
.gks-cost__value small {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.gks-cost__value {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  text-align: right;
  white-space: nowrap;
}

.gks-cost__unknown {
  color: var(--text-subtle);
  font-weight: var(--fw-regular);
  font-size: var(--fs-body-sm);
}

.gks-cost__next {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}
</style>
