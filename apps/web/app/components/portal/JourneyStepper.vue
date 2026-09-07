<script setup lang="ts">
import type { CaseStage } from '@gks/shared';

/**
 * The whole journey in one line (1G-15): every stage of this service in the
 * order `CaseFlowDefinition` defines, with the case's own position marked.
 *
 * On a phone the line does not fit, and a row that scrolls sideways hides the
 * one thing the client came for — where their case stands. So the small screen
 * gets the answer first ("Алхам 4/7 · Материал бүрдүүлэлт" over a segmented
 * rail) and the full list only when it is asked for, stacked, never sideways.
 */
const props = defineProps<{
  journey: CaseStage[];
  stage: CaseStage;
}>();

const currentIndex = computed(() => props.journey.indexOf(props.stage));
/** ON_HOLD / CANCELLED / REJECTED sit outside the main line. */
const isOffTrack = computed(() => currentIndex.value === -1);

/** 1-based, for people: an off-track case has no place in the count. */
const stepNumber = computed(() => (isOffTrack.value ? 0 : currentIndex.value + 1));

function state(index: number): 'done' | 'current' | 'todo' {
  if (isOffTrack.value) return 'todo';
  if (index < currentIndex.value) return 'done';
  return index === currentIndex.value ? 'current' : 'todo';
}

const open = ref(false);
</script>

<template>
  <div class="gks-journey">
    <p v-if="isOffTrack" class="gks-journey__off">
      <DsBadge tone="warning">{{ CASE_STAGE_LABELS[stage] }}</DsBadge>
      <span>Энэ үйлчилгээ үндсэн урсгалаас түр гарсан байна.</span>
    </p>

    <!-- Phone only (CSS): the summary, and the rail that places it. -->
    <button
      type="button"
      class="gks-journey__summary"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="gks-journey__summary-text">
        <span v-if="!isOffTrack" class="gks-journey__count gks-tnum">
          Алхам {{ stepNumber }}/{{ journey.length }}
        </span>
        <span class="gks-journey__now">{{ CASE_STAGE_LABELS[stage] }}</span>
      </span>
      <DsIcon :name="open ? 'chevron-up' : 'chevron-down'" :size="16" />
    </button>

    <div class="gks-journey__rail" aria-hidden="true">
      <span
        v-for="(item, index) in journey"
        :key="item"
        class="gks-journey__segment"
        :class="`gks-journey__segment--${state(index)}`"
      />
    </div>

    <ol class="gks-journey__list" :class="{ 'gks-journey__list--open': open }">
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

/* The summary and the rail belong to the phone; the pill row says it all above. */
.gks-journey__summary, .gks-journey__rail { display: none; }

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

@media (max-width: 640px) {
  .gks-journey { gap: var(--sp-3); }

  .gks-journey__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    font-family: inherit;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
  }
  .gks-journey__summary-text { display: flex; align-items: baseline; gap: var(--sp-2); min-width: 0; }
  .gks-journey__count { flex: none; font-size: var(--fs-micro); text-transform: uppercase; letter-spacing: var(--ls-caps); color: var(--text-subtle); }
  .gks-journey__now {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-body-sm);
    font-weight: var(--fw-semibold);
    color: var(--brand-700);
  }

  /* Seven segments of one bar: the whole journey in 4px of height. */
  .gks-journey__rail { display: flex; gap: 3px; }
  .gks-journey__segment { flex: 1; height: 4px; border-radius: var(--radius-pill); background: var(--n-200); }
  .gks-journey__segment--done { background: var(--success-line); }
  .gks-journey__segment--current { background: var(--brand-600); }

  /* Stacked, so nothing is hidden off the right edge. */
  .gks-journey__list { display: none; }
  .gks-journey__list--open {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    overflow: visible;
    padding-bottom: 0;
  }
  .gks-journey__step {
    width: 100%;
    border: 0;
    border-radius: var(--radius-2);
    background: none;
    padding: var(--sp-2);
    white-space: normal;
    font-size: var(--fs-body-sm);
  }
  .gks-journey__step--done { background: none; }
  .gks-journey__step--current { background: var(--brand-050, var(--surface-selected)); }
}
</style>
