<script setup lang="ts">
/**
 * Primary action control. Square-edged (2px), ink-first; `accent` (red) is
 * reserved for the single most consequential action on a screen.
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'inverse';
    size?: 'sm' | 'md' | 'lg';
    iconLeft?: string;
    iconRight?: string;
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
    type?: 'button' | 'submit' | 'reset';
  }>(),
  { variant: 'primary', size: 'md', type: 'button' },
);

const ICON_SIZE = { sm: 16, md: 18, lg: 20 } as const;
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="gks-btn"
    :class="[`gks-btn--${variant}`, `gks-btn--${size}`, { 'gks-btn--block': block }]"
  >
    <DsIcon v-if="loading" name="loader-circle" :size="ICON_SIZE[size]" class="gks-btn__spin" />
    <DsIcon v-else-if="iconLeft" :name="iconLeft" :size="ICON_SIZE[size]" />
    <span><slot /></span>
    <DsIcon v-if="iconRight" :name="iconRight" :size="ICON_SIZE[size]" />
  </button>
</template>

<style scoped>
.gks-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-1);
  border: var(--border-hair) solid transparent;
  font-family: var(--font-sans);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-btn--block { display: flex; width: 100%; }

.gks-btn--sm { min-height: var(--control-sm); padding: 0 var(--sp-4); font-size: var(--fs-label); gap: var(--sp-2); }
.gks-btn--md { min-height: var(--control-md); padding: 0 var(--sp-6); font-size: var(--fs-body-sm); gap: var(--sp-2); }
.gks-btn--lg { min-height: var(--control-lg); padding: 0 var(--sp-7); font-size: var(--fs-body); gap: var(--sp-3); }

.gks-btn--primary { background: var(--ink-800); border-color: var(--ink-800); color: var(--text-inverse); }
.gks-btn--primary:hover:not(:disabled) { background: var(--ink-700); border-color: var(--ink-700); }
.gks-btn--primary:active:not(:disabled) { background: var(--ink-900); border-color: var(--ink-900); }

.gks-btn--accent { background: var(--red-700); border-color: var(--red-700); color: var(--text-inverse); }
.gks-btn--accent:hover:not(:disabled) { background: var(--red-600); border-color: var(--red-600); }
.gks-btn--accent:active:not(:disabled) { background: var(--red-800); border-color: var(--red-800); }

.gks-btn--secondary { background: var(--n-000); border-color: var(--line-strong); color: var(--ink-800); }
.gks-btn--secondary:hover:not(:disabled) { background: var(--surface-hover); }
.gks-btn--secondary:active:not(:disabled) { background: var(--surface-active); }

.gks-btn--ghost { background: transparent; border-color: transparent; color: var(--ink-800); }
.gks-btn--ghost:hover:not(:disabled) { background: var(--n-100); }
.gks-btn--ghost:active:not(:disabled) { background: var(--n-200); }

.gks-btn--danger { background: var(--n-000); border-color: var(--red-300); color: var(--red-800); }
.gks-btn--danger:hover:not(:disabled) { background: var(--red-050); }
.gks-btn--danger:active:not(:disabled) { background: var(--red-100); }

.gks-btn--inverse { background: transparent; border-color: var(--line-inverse); color: var(--text-inverse); }
.gks-btn--inverse:hover:not(:disabled) { background: rgba(255, 255, 255, .10); }
.gks-btn--inverse:active:not(:disabled) { background: rgba(255, 255, 255, .18); }

.gks-btn:disabled {
  background: var(--n-100);
  border-color: var(--n-200);
  color: var(--text-disabled);
  cursor: not-allowed;
}

.gks-btn__spin { animation: gks-btn-spin .8s linear infinite; }
@keyframes gks-btn-spin { to { transform: rotate(360deg); } }
</style>
