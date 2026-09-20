<script setup lang="ts">
import type { Question } from '@gks/shared';

/**
 * One question of a questionnaire (1D-27).
 *
 * A long answer is a textarea that grows with its text instead of scrolling
 * inside itself: people write paragraphs here, on phones, and a four-line box
 * with its own scrollbar hides what they wrote a minute ago. Yes/no is two big
 * buttons rather than radios, because it is a thumb target and it decides what
 * is asked next.
 */
const props = defineProps<{
  question: Question;
  modelValue?: string;
  /** Required and still empty after the client tried to submit. */
  flagged?: boolean;
  readonly?: boolean;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const id = useId();
const textarea = ref<HTMLTextAreaElement | null>(null);
const kind = computed(() => props.question.kind ?? 'long');
const value = computed(() => props.modelValue ?? '');

function grow() {
  const el = textarea.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`;
}

function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value);
  grow();
}

onMounted(grow);
watch(value, () => nextTick(grow));

/** A soft nudge on the long ones: a sentence is thin, a page is plenty. */
const lengthHint = computed(() => {
  if (kind.value !== 'long' || props.readonly) return null;
  const length = value.value.trim().length;
  if (!length) return null;
  if (length < 60) return 'Жаахан дэлгэрүүлбэл илүү сайн — жишээ, он, нэр нэмээрэй.';
  return null;
});
</script>

<template>
  <div class="gks-q" :class="{ 'gks-q--flagged': flagged }" :data-question="question.id">
    <label :for="id" class="gks-q__label">
      {{ question.label }}
      <span v-if="question.required" class="gks-q__required" title="Заавал хариулна">*</span>
    </label>
    <p v-if="question.hint" class="gks-q__hint">{{ question.hint }}</p>

    <template v-if="readonly">
      <p v-if="kind === 'yesno'" class="gks-q__read">{{ value === 'yes' ? 'Тийм' : value === 'no' ? 'Үгүй' : '—' }}</p>
      <p v-else class="gks-q__read" :class="{ 'gks-q__read--empty': !value.trim() }">{{ value.trim() || 'Хариулаагүй' }}</p>
    </template>

    <div v-else-if="kind === 'yesno'" class="gks-q__toggle" role="radiogroup" :aria-labelledby="id">
      <button
        v-for="option in [{ v: 'yes', label: 'Тийм' }, { v: 'no', label: 'Үгүй' }]"
        :key="option.v"
        type="button"
        role="radio"
        class="gks-q__toggle-btn"
        :class="{ 'gks-q__toggle-btn--on': value === option.v }"
        :aria-checked="value === option.v"
        @click="emit('update:modelValue', value === option.v ? '' : option.v)"
      >
        {{ option.label }}
      </button>
    </div>

    <div v-else-if="kind === 'choice'" class="gks-q__choices" role="radiogroup">
      <button
        v-for="option in question.options"
        :key="option"
        type="button"
        role="radio"
        class="gks-q__chip"
        :class="{ 'gks-q__chip--on': value === option }"
        :aria-checked="value === option"
        @click="emit('update:modelValue', value === option ? '' : option)"
      >
        {{ option }}
      </button>
    </div>

    <input
      v-else-if="kind === 'short'"
      :id="id"
      class="gks-q__input"
      type="text"
      :value="value"
      :placeholder="question.placeholder"
      maxlength="600"
      @input="onInput"
    >

    <textarea
      v-else
      :id="id"
      ref="textarea"
      class="gks-q__textarea"
      rows="3"
      :value="value"
      :placeholder="question.placeholder"
      maxlength="8000"
      @input="onInput"
    />

    <p v-if="flagged" class="gks-q__flag">Энэ асуултад заавал хариулна уу.</p>
    <p v-else-if="lengthHint" class="gks-q__nudge">{{ lengthHint }}</p>
  </div>
</template>

<style scoped>
.gks-q { display: flex; flex-direction: column; gap: var(--sp-2); scroll-margin-top: 120px; }
.gks-q__label { font-size: var(--fs-body); font-weight: var(--fw-semibold); color: var(--text-strong); line-height: var(--lh-snug); }
.gks-q__required { color: var(--red-700); margin-left: 2px; }
.gks-q__hint { font-size: var(--fs-body-sm); color: var(--text-muted); margin-top: calc(var(--sp-1) * -1); }

.gks-q__input,
.gks-q__textarea {
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  background: var(--n-000);
  font-family: var(--font-sans);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  color: var(--text-body);
  outline: none;
  transition: var(--transition-control);
}
.gks-q__textarea { resize: none; min-height: 96px; overflow: hidden; }
.gks-q__input:focus,
.gks-q__textarea:focus { border-color: var(--brand-600); box-shadow: 0 0 0 3px var(--brand-050); }
.gks-q__input::placeholder,
.gks-q__textarea::placeholder { color: var(--text-subtle); font-style: italic; }

.gks-q__toggle { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-2); max-width: 320px; }
.gks-q__toggle-btn,
.gks-q__chip {
  min-height: var(--control-md);
  padding: var(--sp-2) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-2);
  background: var(--n-000);
  font: inherit;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-body);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-q__toggle-btn:hover,
.gks-q__chip:hover { border-color: var(--brand-400); }
.gks-q__toggle-btn--on,
.gks-q__chip--on { border-color: var(--brand-600); background: var(--brand-050); color: var(--brand-800); font-weight: var(--fw-semibold); }
.gks-q__choices { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-q__chip { border-radius: var(--radius-pill); }

.gks-q__read { white-space: pre-wrap; color: var(--text-body); font-size: var(--fs-body); line-height: var(--lh-body); }
.gks-q__read--empty { color: var(--text-subtle); font-style: italic; }

.gks-q--flagged .gks-q__input,
.gks-q--flagged .gks-q__textarea { border-color: var(--red-700); }
.gks-q__flag { font-size: var(--fs-caption); color: var(--danger-fg); }
.gks-q__nudge { font-size: var(--fs-caption); color: var(--text-muted); }
</style>
