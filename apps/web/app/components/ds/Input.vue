<script setup lang="ts">
defineOptions({ inheritAttrs: false });

defineProps<{
  label?: string;
  hint?: string;
  error?: string;
  iconLeft?: string;
  suffix?: string;
  required?: boolean;
  modelValue?: string | number | null;
  disabled?: boolean;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

const inputId = useId();
</script>

<template>
  <div class="gks-field">
    <label v-if="label" :for="inputId" class="gks-field__label">
      {{ label }}<span v-if="required" class="gks-field__required">*</span>
    </label>
    <div
      class="gks-field__control"
      :class="{ 'gks-field__control--error': error, 'gks-field__control--disabled': disabled }"
    >
      <DsIcon v-if="iconLeft" :name="iconLeft" :size="18" class="gks-field__icon" />
      <input
        :id="inputId"
        class="gks-field__input"
        :disabled="disabled"
        :value="modelValue"
        v-bind="$attrs"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
      <span v-if="suffix" class="gks-field__suffix">{{ suffix }}</span>
    </div>
    <span v-if="error || hint" class="gks-field__note" :class="{ 'gks-field__note--error': error }">
      <DsIcon v-if="error" name="triangle-alert" :size="14" />{{ error || hint }}
    </span>
  </div>
</template>

<style scoped>
.gks-field { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-field__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
  letter-spacing: var(--ls-label);
}
.gks-field__required { color: var(--red-700); margin-left: 4px; }

.gks-field__control {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: var(--control-md);
  padding: 0 var(--sp-4);
  background: var(--n-000);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-1);
  transition: var(--transition-control);
}
.gks-field__control:focus-within { border-color: var(--ink-800); box-shadow: inset 0 0 0 1px var(--ink-800); }
.gks-field__control--error { border-color: var(--red-700); }
.gks-field__control--error:focus-within { box-shadow: inset 0 0 0 1px var(--red-700); }
.gks-field__control--disabled { background: var(--n-050); }

.gks-field__icon { color: var(--text-subtle); }
.gks-field__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  padding: var(--sp-3) 0;
  font-size: var(--fs-body);
  font-family: var(--font-sans);
  color: var(--text-body);
}
.gks-field__suffix { font-size: var(--fs-caption); color: var(--text-subtle); font-family: var(--font-mono); }

.gks-field__note { display: flex; align-items: center; gap: 6px; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-field__note--error { color: var(--red-800); }
</style>
