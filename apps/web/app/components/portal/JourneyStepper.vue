<script setup lang="ts">
import type { CaseStage } from '@gks/shared';

/**
 * The whole journey in one line (1G-15): every stage of this service in the
 * order `CaseFlowDefinition` defines, with the case's own position marked.
 */
const props = defineProps<{
  journey: CaseStage[];
  stage: CaseStage;
}>();

const currentIndex = computed(() => props.journey.indexOf(props.stage));
/** ON_HOLD / CANCELLED / REJECTED sit outside the main line. */
const isOffTrack = computed(() => currentIndex.value === -1);

function state(index: number): 'done' | 'current' | 'todo' {
  if (isOffTrack.value) return 'todo';
  if (index < currentIndex.value) return 'done';
  return index === currentIndex.value ? 'current' : 'todo';
}
</script>

<template>
  <div class="gks-journey">
    <p v-if="isOffTrack" class="gks-journey__off">
      <DsBadge tone="warning">{{ CASE_STAGE_LABELS[stage] }}</DsBadge>
      <span>Энэ үйлчилгээ үндсэн урсгалаас түр гарсан байна.</span>
    </p>

    <ol class="gks-journey__list">
      <li
        v-for="(item, index) in journey"
        :key="item"
        class="gks-journey__step"
        :class="`gks-journey__step--${state(index)}`"
      >
        <span class="gks-journey__marker">
          <DsIcon v-if="state(index) === 'done'" name="check" :size="12" />
          <span v-else class="gks-journey__dot" />
        </span>
        <span class="gks-journey__label">{{ CASE_STAGE_LABELS[item] }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.gks-journey { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-journey__off { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-journey__list {
  display: flex;
  gap: var(--sp-2);
  overflow-x: auto;
  padding-bottom: var(--sp-2);
  list-style: none;
  margin: 0;
}
.gks-journey__step {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-pill);
  border: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  white-space: nowrap;
}
.gks-journey__marker { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; }
.gks-journey__dot { width: 7px; height: 7px; border-radius: var(--radius-pill); background: currentColor; opacity: .45; }

.gks-journey__step--done { border-color: var(--success-line); background: var(--success-bg); color: var(--success-fg); }
.gks-journey__step--current {
  border-color: var(--brand-500);
  background: var(--brand-050, var(--surface-selected));
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
}
</style>
