<script setup lang="ts">
/**
 * The question box (2C-02).
 *
 * Grows with the text up to a ceiling, then scrolls — a question that has
 * scrolled out of its own field is one nobody proof-reads. Enter sends;
 * Shift+Enter is the newline, which is the convention every messenger has
 * taught people, and the one the 1K composer already uses.
 */
const props = defineProps<{ disabled?: boolean; placeholder?: string }>();
const emit = defineEmits<{ send: [text: string] }>();

const text = ref('');
const field = ref<HTMLTextAreaElement | null>(null);

/** Two lines' worth before it starts scrolling — about 120px. */
const MAX_HEIGHT = 120;

function resize(): void {
  const el = field.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
}

watch(text, () => nextTick(resize));

function submit(): void {
  const value = text.value.trim();
  if (!value || props.disabled) return;

  emit('send', value);
  text.value = '';
  nextTick(resize);
}

function onKeydown(event: KeyboardEvent): void {
  // `isComposing` is the one that matters here: a Mongolian or Korean IME uses
  // Enter to accept the candidate, and sending on that keystroke cuts the word
  // in half and posts it.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}

function focus(): void {
  field.value?.focus();
}

defineExpose({ focus });
</script>

<template>
  <form class="gks-chat-composer" @submit.prevent="submit">
    <textarea
      ref="field"
      v-model="text"
      class="gks-chat-composer__field"
      rows="1"
      :placeholder="placeholder ?? 'Асуултаа бичнэ үү…'"
      :disabled="disabled"
      @keydown="onKeydown"
    />
    <DsIconButton
      icon="send"
      label="Илгээх"
      variant="outline"
      size="sm"
      type="submit"
      :disabled="disabled || !text.trim()"
    />
  </form>
</template>

<style scoped>
.gks-chat-composer {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-top: var(--border-hair) solid var(--line-soft);
  background: var(--surface-card);
}
.gks-chat-composer__field {
  flex: 1;
  min-height: 38px;
  max-height: 120px;
  padding: var(--sp-2) var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-wash);
  font: inherit;
  /* 16px or iOS Safari zooms the whole page in when the field takes focus. */
  font-size: 16px;
  line-height: var(--lh-body);
  color: var(--text-strong);
  resize: none;
}
.gks-chat-composer__field:focus-visible { outline: 2px solid var(--brand-600); outline-offset: 1px; }
.gks-chat-composer__field:disabled { opacity: .6; }

@media (min-width: 641px) {
  .gks-chat-composer__field { font-size: var(--fs-body-sm); }
}
</style>
