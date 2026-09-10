<script setup lang="ts">
import type { PortalCase } from '@gks/shared';

/** One service cycle as a row on the dashboard and the case list. */
defineProps<{ item: PortalCase }>();

</script>

<template>
  <NuxtLink :to="`/app/cases/${item.id}`" class="gks-case-card">
    <DsCard>
      <div class="gks-case-card__head">
        <div>
          <p class="gks-case-card__code gks-tnum">{{ item.code }}</p>
          <p class="gks-case-card__service">
            {{ SERVICE_LABELS[item.serviceType] }}
            <span v-if="item.university"> · {{ universityName(item.university) }}</span>
          </p>
        </div>
        <DsBadge :tone="CASE_STAGE_TONE[item.stage]">{{ CASE_STAGE_LABELS[item.stage] }}</DsBadge>
      </div>

      <div v-if="item.documents.admission.requiredTotal > 0" class="gks-case-card__progress">
        <div class="gks-case-card__bar">
          <div class="gks-case-card__fill" :style="{ width: `${item.documents.admission.percent}%` }" />
        </div>
        <span class="gks-case-card__percent gks-tnum">
          Материал {{ item.documents.admission.requiredDone }}/{{ item.documents.admission.requiredTotal }}
        </span>
      </div>

      <p class="gks-case-card__next">
        <DsIcon name="circle-arrow-right" :size="15" />
        <span>{{ item.nextAction.label }}</span>
      </p>
    </DsCard>
  </NuxtLink>
</template>

<style scoped>
.gks-case-card { text-decoration: none; color: inherit; display: block; }
.gks-case-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
.gks-case-card__code { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-case-card__service { margin-top: var(--sp-1); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-case-card__progress { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4); }
.gks-case-card__bar { flex: 1; height: 6px; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.gks-case-card__fill { height: 100%; background: var(--brand-500); }
.gks-case-card__percent { font-size: var(--fs-caption); color: var(--text-subtle); white-space: nowrap; }

.gks-case-card__next {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding-top: var(--sp-3);
  border-top: var(--border-hair) solid var(--line-hairline);
  font-size: var(--fs-body-sm);
  color: var(--brand-700);
  font-weight: var(--fw-medium);
}
</style>
