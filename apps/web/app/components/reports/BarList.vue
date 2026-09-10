<script setup lang="ts">
/**
 * A labelled bar per row, scaled against the largest value in the set.
 *
 * Every distribution on the report screens is one of these — income by month,
 * enquiries by channel, cases by stage — so they are one component and read
 * the same way each time.
 */
const props = defineProps<{
  rows: { key: string; label: string; value: number; note?: string; tone?: 'brand' | 'danger' | 'warning' }[];
  emptyText?: string;
}>();

const max = computed(() => barMax(props.rows.map((row) => row.value)));
</script>

<template>
  <p v-if="!rows.length" class="gks-bars__empty">{{ emptyText ?? 'Мэдээлэл алга.' }}</p>
  <div v-else class="gks-bars">
    <div v-for="row in rows" :key="row.key" class="gks-bars__row">
      <span class="gks-bars__label">{{ row.label }}</span>
      <span class="gks-bars__track">
        <span
          class="gks-bars__fill"
          :class="row.tone ? `gks-bars__fill--${row.tone}` : ''"
          :style="{ width: barWidth(row.value, max) }"
        />
      </span>
      <span class="gks-bars__value gks-tnum">{{ row.note ?? formatNumber(row.value) }}</span>
    </div>
  </div>
</template>

<style scoped>
.gks-bars { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-bars__empty { font-size: var(--fs-body-sm); color: var(--text-subtle); }
.gks-bars__row {
  display: grid;
  grid-template-columns: minmax(120px, 200px) 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  font-size: var(--fs-body-sm);
}
.gks-bars__label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-strong); }
.gks-bars__track { height: 8px; border-radius: var(--radius-pill); background: var(--line-hairline); overflow: hidden; }
.gks-bars__fill { display: block; height: 100%; background: var(--brand-600); }
.gks-bars__fill--danger { background: var(--danger-fg); }
.gks-bars__fill--warning { background: var(--warning-fg); }
.gks-bars__value { font-size: var(--fs-micro); color: var(--text-subtle); white-space: nowrap; }

@media (max-width: 620px) {
  .gks-bars__row { grid-template-columns: minmax(90px, 1fr) 1fr auto; }
}
</style>
