<script setup lang="ts">
defineOptions({ inheritAttrs: false });

withDefaults(
  defineProps<{
    label?: string;
    hint?: string;
    error?: string;
    rows?: number;
    modelValue?: string | null;
    disabled?: boolean;
  }>(),
  { rows: 4 },
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const textareaId = useId();
</script>

<template>
  <div class="gks-field">
    <label v-if="label" :for="textareaId" class="gks-field__label">{{ label }}</label>
    <textarea
      :id="textareaId"
      class="gks-field__textarea"
      :class="{ 'gks-field__textarea--error': error }"
      :rows="rows"
      :disabled="disabled"
      :value="modelValue"
      v-bind="$attrs"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <span v-if="error || hint" class="gks-field__note" :class="{ 'gks-field__note--error': error }">
      {{ error || hint }}
    </span>
  </div>
</template>

<style scoped>
.gks-field { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-field__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
  color: var(--text-body);
}
.gks-field__textarea {
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  background: var(--n-000);
  resize: vertical;
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-body);
  outline: none;
  transition: var(--transition-control);
}
.gks-field__textarea:focus,
.gks-field__textarea:focus-visible { border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-050); }
.gks-field__textarea--error { border-color: var(--red-700); }
.gks-field__textarea:disabled { background: var(--n-050); color: var(--text-disabled); }

.gks-field__note { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-field__note--error { color: var(--red-800); }
</style>
