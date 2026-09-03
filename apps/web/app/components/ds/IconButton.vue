<script setup lang="ts">
withDefaults(
  defineProps<{
    icon: string;
    label: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'ghost' | 'outline';
    disabled?: boolean;
  }>(),
  { size: 'md', variant: 'ghost' },
);

const DIM = { sm: 36, md: 44, lg: 52 } as const;
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    class="gks-icon-btn"
    :class="`gks-icon-btn--${variant}`"
    :style="{ width: `${DIM[size]}px`, height: `${DIM[size]}px` }"
  >
    <DsIcon :name="icon" :size="size === 'sm' ? 18 : 20" />
  </button>
</template>

<style scoped>
.gks-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-1);
  border: var(--border-hair) solid transparent;
  background: transparent;
  color: var(--ink-700);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-icon-btn--outline { border-color: var(--line-strong); background: var(--n-000); }
.gks-icon-btn--ghost:hover:not(:disabled),
.gks-icon-btn--outline:hover:not(:disabled) { background: var(--surface-hover); }
.gks-icon-btn:disabled { color: var(--text-disabled); cursor: not-allowed; background: transparent; }
</style>
