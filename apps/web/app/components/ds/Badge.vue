<script setup lang="ts">
withDefaults(
  defineProps<{
    tone?: 'neutral' | 'ink' | 'accent' | 'info' | 'success' | 'warning' | 'danger';
    /** Lucide icon name — always supply one when the badge carries meaning. */
    icon?: string;
  }>(),
  { tone: 'neutral' },
);
</script>

<template>
  <span class="gks-badge" :class="`gks-badge--${tone}`">
    <DsIcon v-if="icon" :name="icon" :size="12" />
    <slot />
  </span>
</template>

<style scoped>
.gks-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px var(--sp-2);
  border: var(--border-hair) solid transparent;
  border-radius: var(--radius-pill);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  line-height: 1.5;
  white-space: nowrap;
}
.gks-badge--neutral { color: var(--n-700); background: var(--n-100); border-color: var(--n-200); }
.gks-badge--ink { color: var(--text-inverse); background: var(--ink-800); border-color: var(--ink-800); }
.gks-badge--accent { color: var(--text-inverse); background: var(--red-700); border-color: var(--red-700); }
.gks-badge--info { color: var(--info-fg); background: var(--info-bg); border-color: var(--info-line); }
.gks-badge--success { color: var(--success-fg); background: var(--success-bg); border-color: var(--success-line); }
.gks-badge--warning { color: var(--warning-fg); background: var(--warning-bg); border-color: var(--warning-line); }
.gks-badge--danger { color: var(--danger-fg); background: var(--danger-bg); border-color: var(--danger-line); }
</style>
