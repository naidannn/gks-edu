<script setup lang="ts">
import type { ReportPeriodInfo, ReportPreset } from '@gks/shared';

/**
 * The one control every report on the screen runs on.
 *
 * A report without a period is not a report — "нийт орлого" over all time
 * answers no question the office has — so this sits in the page header and
 * drives all six endpoints at once. The resolved window is printed back
 * underneath, because a preset the user picked and a window the server used are
 * not the same claim.
 */
const preset = defineModel<ReportPreset>('preset', { required: true });
const from = defineModel<string>('from', { required: true });
const to = defineModel<string>('to', { required: true });

defineProps<{ period: ReportPeriodInfo | null; busy?: boolean }>();
</script>

<template>
  <div class="gks-period">
    <DsSelect
      :model-value="preset"
      :options="REPORT_PRESET_OPTIONS"
      label="Хугацаа"
      :disabled="busy"
      @update:model-value="preset = $event as ReportPreset"
    />

    <template v-if="preset === 'custom'">
      <DsInput v-model="from" type="date" label="Эхлэх" :disabled="busy" />
      <DsInput v-model="to" type="date" label="Дуусах" :disabled="busy" />
    </template>

    <p v-if="period" class="gks-period__resolved">
      <strong>{{ period.labelMn }}</strong>
      <span class="gks-tnum">{{ period.from }} – {{ period.to }} (өмнөх: {{ period.previousFrom }})</span>
    </p>
  </div>
</template>

<style scoped>
.gks-period { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--sp-3); }
.gks-period__resolved { display: flex; flex-direction: column; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-period__resolved strong { color: var(--text-strong); font-weight: var(--fw-semibold); }
</style>
