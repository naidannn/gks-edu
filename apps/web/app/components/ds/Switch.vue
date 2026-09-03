<script setup lang="ts">
defineProps<{
  label?: string;
  modelValue?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ 'update:modelValue': [value: boolean] }>();
</script>

<template>
  <label class="gks-switch" :class="{ 'gks-switch--disabled': disabled }">
    <input
      type="checkbox"
      role="switch"
      class="gks-switch__input"
      :checked="!!modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span aria-hidden="true" class="gks-switch__track" :class="{ 'gks-switch__track--checked': modelValue }">
      <span class="gks-switch__thumb" :class="{ 'gks-switch__thumb--checked': modelValue }" />
    </span>
    <span v-if="label" class="gks-switch__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.gks-switch {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: var(--control-md);
  cursor: pointer;
}
.gks-switch--disabled { cursor: not-allowed; opacity: .55; }
.gks-switch__input { position: absolute; opacity: 0; width: 1px; height: 1px; }

.gks-switch__track {
  width: 44px;
  height: 24px;
  flex: 0 0 auto;
  padding: 2px;
  display: flex;
  background: var(--n-300);
  border-radius: var(--radius-2);
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.gks-switch__track--checked { background: var(--brand-600); }

.gks-switch__thumb {
  width: 20px;
  height: 20px;
  background: var(--n-000);
  transition: transform var(--dur-fast) var(--ease-standard);
}
.gks-switch__thumb--checked { transform: translateX(20px); }

.gks-switch__label { font-size: var(--fs-body-sm); color: var(--text-body); }
</style>
