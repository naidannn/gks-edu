<script setup lang="ts">
import type { StudyPlanMilestone } from '@gks/shared';

/**
 * The six steps between today and the plane.
 *
 * Only two of them carry a date, and that is on purpose: registration and
 * departure are dates somebody can miss, while a visa appointment invented
 * three months out is the date a family resigns a job around. The rest say
 * *when relative to what*, in words.
 */
defineProps<{ milestones: StudyPlanMilestone[] }>();
</script>

<template>
  <ol class="gks-tl">
    <li v-for="(milestone, index) in milestones" :key="milestone.key" class="gks-tl__step">
      <span class="gks-tl__marker" aria-hidden="true">{{ index + 1 }}</span>
      <div class="gks-tl__body">
        <strong class="gks-tl__title">{{ milestone.titleMn }}</strong>
        <time v-if="formatPlanDate(milestone.date)" class="gks-tl__date">
          {{ formatPlanDate(milestone.date) }}
        </time>
        <p class="gks-tl__text">{{ milestone.textMn }}</p>
      </div>
    </li>
  </ol>
</template>

<style scoped>
.gks-tl {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-1);
}

.gks-tl__step {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: var(--sp-3);
  position: relative;
  padding-bottom: var(--sp-4);
}

/* The rail: drawn from each marker to the next, so the last step ends clean. */
.gks-tl__step:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 28px;
  bottom: 0;
  width: 2px;
  background: var(--line-soft);
}

.gks-tl__marker {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
  font-variant-numeric: var(--num-tabular);
}

.gks-tl__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 3px;
}

.gks-tl__title {
  font-size: var(--fs-body-sm);
  letter-spacing: var(--ls-label);
}

.gks-tl__date {
  color: var(--text-accent);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  font-variant-numeric: var(--num-tabular);
}

.gks-tl__text {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}
</style>
