<script setup lang="ts" generic="T extends string | number">
import type { PlanChoice } from '~/utils/study-plan';

/**
 * The planner's one input control: a grid of things to tap.
 *
 * It is both the wizard's question and the answer page's filter chips, which is
 * deliberate — the visitor learns the gesture once and then keeps using it to
 * change the answer, which is the whole "хот солих" idea.
 */
withDefaults(
  defineProps<{
    choices: PlanChoice<T>[];
    modelValue: T | null;
    /** `chip` is the compact row used above the results. */
    variant?: 'card' | 'chip';
    label?: string;
    /** Per-choice counts, keyed by value — shown on the result-page chips. */
    counts?: Record<string, number>;
  }>(),
  { variant: 'card' },
);

const emit = defineEmits<{ 'update:modelValue': [T] }>();
</script>

<template>
  <div
    class="gks-choice"
    :class="`gks-choice--${variant}`"
    role="radiogroup"
    :aria-label="label"
  >
    <button
      v-for="choice in choices"
      :key="String(choice.value)"
      type="button"
      role="radio"
      class="gks-choice__item"
      :class="{ 'gks-choice__item--on': choice.value === modelValue }"
      :aria-checked="choice.value === modelValue"
      @click="emit('update:modelValue', choice.value)"
    >
      <DsIcon :name="choice.icon" :size="variant === 'card' ? 22 : 15" />
      <span class="gks-choice__text">
        <span class="gks-choice__label">
          {{ choice.label }}
          <small v-if="counts && counts[String(choice.value)] !== undefined" class="gks-tnum">
            {{ counts[String(choice.value)] }}
          </small>
        </span>
        <small v-if="choice.hint && variant === 'card'" class="gks-choice__hint">{{ choice.hint }}</small>
      </span>
    </button>
  </div>
</template>

<style scoped>
.gks-choice {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.gks-choice--card {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
}

.gks-choice__item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  color: var(--text-body);
  font-family: var(--font-sans);
  cursor: pointer;
  text-align: left;
  transition: var(--transition-control);
}

.gks-choice--card .gks-choice__item {
  padding: var(--sp-4);
  min-height: var(--control-lg);
}

.gks-choice--chip .gks-choice__item {
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-pill);
  font-size: var(--fs-label);
  min-height: var(--control-sm);
}

.gks-choice__item:hover {
  border-color: var(--line-strong);
  background: var(--surface-hover);
}

.gks-choice__item--on,
.gks-choice__item--on:hover {
  border-color: var(--line-accent);
  background: var(--surface-selected);
  color: var(--text-accent);
}

.gks-choice__item:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.gks-choice__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gks-choice__label {
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
}

.gks-choice__label small {
  color: var(--text-subtle);
  font-weight: var(--fw-regular);
  margin-left: 4px;
}

.gks-choice__hint {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  font-weight: var(--fw-regular);
}
</style>
