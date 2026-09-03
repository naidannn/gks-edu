<script setup lang="ts">
defineProps<{
  label?: string;
  description?: string;
  modelValue?: boolean;
  disabled?: boolean;
}>();

defineEmits<{ 'update:modelValue': [value: boolean] }>();

const checkboxId = useId();
</script>

<template>
  <label :for="checkboxId" class="gks-checkbox" :class="{ 'gks-checkbox--disabled': disabled }">
    <input
      :id="checkboxId"
      type="checkbox"
      class="gks-checkbox__input"
      :checked="!!modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    >
    <span aria-hidden="true" class="gks-checkbox__box" :class="{ 'gks-checkbox__box--checked': modelValue }">
      <DsIcon v-if="modelValue" name="check" :size="15" />
    </span>
    <span v-if="label || description" class="gks-checkbox__text">
      <span v-if="label" class="gks-checkbox__label">{{ label }}</span>
      <span v-if="description" class="gks-checkbox__description">{{ description }}</span>
    </span>
  </label>
</template>

<style scoped>
.gks-checkbox {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
  min-height: var(--control-md);
  padding: var(--sp-2) 0;
  cursor: pointer;
}
.gks-checkbox--disabled { cursor: not-allowed; opacity: .55; }

.gks-checkbox__input { position: absolute; opacity: 0; width: 1px; height: 1px; }

.gks-checkbox__box {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  margin-top: 2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: var(--border-hair) solid var(--line-strong);
  background: var(--n-000);
  color: var(--text-inverse);
  border-radius: var(--radius-2);
  transition: var(--transition-control);
}
.gks-checkbox__box--checked { border-color: var(--brand-600); background: var(--brand-600); }

.gks-checkbox__text { display: flex; flex-direction: column; gap: 2px; }
.gks-checkbox__label { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-checkbox__description { font-size: var(--fs-caption); color: var(--text-muted); }
</style>
