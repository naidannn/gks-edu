<script setup lang="ts">
defineOptions({ inheritAttrs: false });

/**
 * A class written on the component belongs to the *field*, not to the control
 * inside it: every caller passes a layout class (`gks-form-grid__full`), and
 * with `inheritAttrs: false` those were landing on the `<input>` itself, where
 * `grid-column` means nothing — so "make this field span the row" silently did
 * nothing on every form in the app. Class and style go to the wrapper; the rest
 * of the attributes (`type`, `required`, `placeholder`, …) go to the control.
 */
const attrs = useAttrs();
const wrapperClass = computed(() => attrs.class as string | undefined);
const wrapperStyle = computed(() => attrs.style as string | undefined);
const controlAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs;
  return rest;
});

defineProps<{
  label?: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
  modelValue?: string | null;
  disabled?: boolean;
}>();

defineEmits<{ 'update:modelValue': [value: string] }>();

const selectId = useId();
</script>

<template>
  <div class="gks-field" :class="wrapperClass" :style="wrapperStyle">
    <label v-if="label" :for="selectId" class="gks-field__label">{{ label }}</label>
    <div class="gks-field__select-wrap">
      <select
        :id="selectId"
        class="gks-field__select"
        :class="{ 'gks-field__select--error': error }"
        :disabled="disabled"
        :value="modelValue"
        v-bind="controlAttrs"
        @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
      <DsIcon name="chevron-down" :size="18" class="gks-field__chevron" />
    </div>
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
.gks-field__select-wrap { position: relative; display: flex; align-items: center; }
.gks-field__select {
  appearance: none;
  width: 100%;
  min-height: var(--control-md);
  padding: 0 var(--sp-9) 0 var(--sp-4);
  background: var(--n-000);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  color: var(--text-body);
  outline: none;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-field__select:focus,
.gks-field__select:focus-visible { border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-050); }
.gks-field__select--error { border-color: var(--red-700); }
.gks-field__select:disabled { background: var(--n-050); color: var(--text-disabled); cursor: not-allowed; }
.gks-field__chevron { position: absolute; right: var(--sp-4); pointer-events: none; color: var(--text-muted); }

.gks-field__note { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-field__note--error { color: var(--red-800); }
</style>
