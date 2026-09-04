<script setup lang="ts">
import type { ClientAlert } from '@gks/shared';

/**
 * "Юунд анхаарах вэ?" (1G-17) — overdue paperwork, unpaid invoices, returned
 * documents and deadlines inside a week, computed on the server. Each row is a
 * link to the tab that resolves it, so an alert is never a dead end.
 */
const props = defineProps<{ alerts: ClientAlert[] }>();
const emit = defineEmits<{ open: [tab: ClientAlert['tab']] }>();

const TONE = { danger: 'danger', warning: 'warning', info: 'info' } as const;
const ICON = { danger: 'triangle-alert', warning: 'clock', info: 'info' } as const;

/** Worst first — an overdue thing outranks an approaching one. */
const ordered = computed(() => {
  const rank = { danger: 0, warning: 1, info: 2 };
  return [...props.alerts].sort((a, b) => rank[a.level] - rank[b.level]);
});

function detailText(alert: ClientAlert): string | null {
  if (!alert.detail) return null;
  const asDate = new Date(alert.detail);
  if (!Number.isNaN(asDate.getTime()) && alert.detail.includes('-')) {
    return asDate.toLocaleDateString('mn-MN', { month: 'short', day: 'numeric' });
  }
  return alert.detail;
}
</script>

<template>
  <DsCard v-if="ordered.length" title="Анхаарах зүйл" :accent="ordered[0]?.level === 'danger'">
    <template #action>
      <span class="gks-alerts__count gks-tnum">{{ ordered.length }}</span>
    </template>
    <ul class="gks-alerts">
      <li v-for="alert in ordered" :key="alert.key">
        <button type="button" class="gks-alerts__row" @click="emit('open', alert.tab)">
          <DsBadge :tone="TONE[alert.level]" :icon="ICON[alert.level]">
            {{ alert.level === 'danger' ? 'Яаралтай' : 'Анхаар' }}
          </DsBadge>
          <span class="gks-alerts__label">{{ alert.label }}</span>
          <span v-if="detailText(alert)" class="gks-alerts__detail gks-tnum">{{ detailText(alert) }}</span>
          <DsIcon name="chevron-right" :size="16" class="gks-alerts__chevron" />
        </button>
      </li>
    </ul>
  </DsCard>

  <DsCard v-else title="Анхаарах зүйл">
    <p class="gks-alerts__clear"><DsIcon name="circle-check" :size="16" /> Хугацаа хэтэрсэн, дутуу зүйл алга.</p>
  </DsCard>
</template>

<style scoped>
.gks-alerts { display: flex; flex-direction: column; }
.gks-alerts__count { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-alerts__row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) 0;
  border: 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-alerts li:last-child .gks-alerts__row { border-bottom: 0; }
.gks-alerts__row:hover { background: var(--surface-hover); }
.gks-alerts__label { flex: 1; min-width: 0; font-size: var(--fs-body-sm); color: var(--text-strong); }
.gks-alerts__detail { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-alerts__chevron { color: var(--text-subtle); flex: none; }
.gks-alerts__clear { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }
</style>
