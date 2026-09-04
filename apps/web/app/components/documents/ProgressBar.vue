<script setup lang="ts">
import type { StageProgress } from '@gks/shared';

/** 1D-19 — "хэдэн % бүрдсэн" as one compact bar. */
defineProps<{ progress: StageProgress; label?: string }>();
</script>

<template>
  <div class="gks-progress">
    <div class="gks-progress__head">
      <span class="gks-progress__label">{{ label ?? 'Материалын бүрдэлт' }}</span>
      <span class="gks-progress__value gks-tnum">
        {{ progress.requiredDone }}/{{ progress.requiredTotal }} · {{ progress.percent }}%
      </span>
    </div>
    <div
      class="gks-progress__track"
      role="progressbar"
      :aria-valuenow="progress.percent"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <div class="gks-progress__fill" :style="{ width: `${progress.percent}%` }" />
    </div>
    <p v-if="progress.awaitingReview || progress.needsFix" class="gks-progress__note">
      <span v-if="progress.awaitingReview">{{ progress.awaitingReview }} шалгагдаж байна</span>
      <span v-if="progress.awaitingReview && progress.needsFix"> · </span>
      <span v-if="progress.needsFix" class="gks-progress__note--warn">{{ progress.needsFix }} засвар шаардлагатай</span>
    </p>
  </div>
</template>

<style scoped>
.gks-progress { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-progress__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-3); }
.gks-progress__label { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.gks-progress__value { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-progress__track { height: 8px; border-radius: var(--radius-pill); background: var(--n-100); overflow: hidden; }
.gks-progress__fill { height: 100%; background: var(--brand-600); border-radius: var(--radius-pill); transition: width var(--dur-base) var(--ease-standard); }
.gks-progress__note { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-progress__note--warn { color: var(--warning-fg); }
</style>
