<script setup lang="ts">
defineProps<{
  selected?: boolean;
  clickable?: boolean;
  removable?: boolean;
}>();

const emit = defineEmits<{ click: []; remove: [] }>();
</script>

<template>
  <span
    class="gks-tag"
    :class="{ 'gks-tag--selected': selected, 'gks-tag--clickable': clickable }"
    :role="clickable ? 'button' : undefined"
    :tabindex="clickable ? 0 : undefined"
    @click="clickable && emit('click')"
  >
    <slot />
    <button
      v-if="removable"
      type="button"
      class="gks-tag__remove"
      aria-label="Устгах"
      @click.stop="emit('remove')"
    >
      <DsIcon name="x" :size="13" />
    </button>
  </span>
</template>

<style scoped>
.gks-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 32px;
  padding: 0 var(--sp-3);
  background: var(--n-000);
  color: var(--text-body);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-pill);
  font-size: var(--fs-caption);
  font-weight: var(--fw-medium);
  transition: var(--transition-control);
}
.gks-tag--selected { background: var(--ink-800); color: var(--text-inverse); border-color: var(--ink-800); }
.gks-tag--clickable { cursor: pointer; }

.gks-tag__remove {
  border: 0;
  background: transparent;
  padding: 0;
  display: flex;
  cursor: pointer;
  color: inherit;
}
</style>
