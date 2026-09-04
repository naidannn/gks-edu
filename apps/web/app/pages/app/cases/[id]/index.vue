<script setup lang="ts">
import type { CaseDetail, CaseTransitionItem } from '@gks/shared';

/** Case overview: transition history (1C-17). */
definePageMeta({ middleware: 'auth' });

const { gksCase } = inject('caseDetail') as { gksCase: Ref<CaseDetail | null>; reload: () => Promise<void> };

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function transitionLabel(t: CaseTransitionItem): string {
  return `${CASE_STAGE_LABELS[t.fromStage]} → ${CASE_STAGE_LABELS[t.toStage]}`;
}
</script>

<template>
  <div v-if="gksCase" class="gks-overview">
    <DsCard title="Явцын түүх">
      <ol v-if="gksCase.transitions.length" class="gks-timeline">
        <li v-for="t in gksCase.transitions" :key="t.id" class="gks-timeline__item">
          <p class="gks-timeline__stage">{{ transitionLabel(t) }}</p>
          <p class="gks-timeline__date gks-tnum">{{ formatDateTime(t.createdAt) }}</p>
        </li>
      </ol>
      <p v-else class="gks-overview__unknown">Явцын түүх хараахан алга байна.</p>
    </DsCard>

    <DsCard title="Материал">
      <p class="gks-overview__unknown">Материалын жагсаалт "Материал бүрдүүлж буй" шатанд нээгдэнэ.</p>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-overview { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-overview__unknown { color: var(--text-subtle); font-style: italic; }
.gks-timeline { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-timeline__item { padding-bottom: var(--sp-3); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-timeline__item:last-child { border-bottom: 0; padding-bottom: 0; }
.gks-timeline__stage { font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }
.gks-timeline__date { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }
</style>
