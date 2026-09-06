<script setup lang="ts">
/**
 * The write box (1K).
 *
 * Enter sends, Shift+Enter breaks the line — the convention every messenger
 * shares, and the one people's hands already know. The field grows with the
 * text up to six lines and then scrolls, so a long message never pushes the
 * thread off the screen.
 */
const props = withDefaults(
  defineProps<{
    placeholder?: string;
    disabled?: boolean;
    sending?: boolean;
    /** Renders the send affordance as a full-width button — used on the mobile client view. */
    autofocus?: boolean;
  }>(),
  { placeholder: 'Мессежээ бичнэ үү…' },
);

const emit = defineEmits<{ send: [body: string]; typing: [] }>();

const MAX_LENGTH = 4000;
const MAX_ROWS = 6;

const body = ref('');
const field = ref<HTMLTextAreaElement | null>(null);

const canSend = computed(() => body.value.trim().length > 0 && !props.disabled && !props.sending);
/** Only worth showing near the ceiling; a counter on an empty box is noise. */
const remaining = computed(() => MAX_LENGTH - body.value.length);
const showCount = computed(() => remaining.value <= 200);

function resize(): void {
  const el = field.value;
  if (!el) return;
  el.style.height = 'auto';
  const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 22;
  const padding = 24;
  el.style.height = `${Math.min(el.scrollHeight, lineHeight * MAX_ROWS + padding)}px`;
}

function onInput(): void {
  resize();
  if (body.value.trim()) emit('typing');
}

function submit(): void {
  if (!canSend.value) return;
  emit('send', body.value.trim());
  body.value = '';
  nextTick(resize);
}

function onKeydown(event: KeyboardEvent): void {
  // An IME composing Cyrillic or Hangul uses Enter to accept a candidate;
  // sending on that keystroke would cut the word in half.
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  submit();
}

/** Lets the page put the cursor here — after opening a thread, say. */
function focus(): void {
  field.value?.focus();
}
defineExpose({ focus });

onMounted(() => {
  if (props.autofocus) focus();
  resize();
});
</script>

<template>
  <div class="gks-composer" :class="{ 'gks-composer--disabled': disabled }">
    <div class="gks-composer__box">
      <textarea
        ref="field"
        v-model="body"
        class="gks-composer__field"
        rows="1"
        :maxlength="MAX_LENGTH"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-label="placeholder"
        @input="onInput"
        @keydown="onKeydown"
      />

      <button
        type="button"
        class="gks-composer__send"
        :disabled="!canSend"
        :aria-label="sending ? 'Илгээж байна' : 'Илгээх'"
        @click="submit"
      >
        <DsIcon :name="sending ? 'loader-circle' : 'send-horizontal'" :size="18" :class="{ 'gks-composer__spin': sending }" />
      </button>
    </div>

    <div class="gks-composer__foot">
      <span class="gks-composer__hint">
        <kbd>Enter</kbd> илгээх · <kbd>Shift</kbd>+<kbd>Enter</kbd> шинэ мөр
      </span>
      <span v-if="showCount" class="gks-composer__count gks-tnum" :class="{ 'gks-composer__count--low': remaining < 40 }">
        {{ remaining }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.gks-composer { display: flex; flex-direction: column; gap: var(--sp-2); }

.gks-composer__box {
  display: flex;
  align-items: flex-end;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  transition: var(--transition-control), box-shadow var(--dur-fast) var(--ease-standard);
}
.gks-composer__box:focus-within {
  border-color: var(--line-accent);
  box-shadow: 0 0 0 3px var(--brand-050);
}
.gks-composer--disabled .gks-composer__box { background: var(--surface-sunken); }

.gks-composer__field {
  flex: 1;
  min-width: 0;
  padding: var(--sp-2) 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  font-family: var(--font-sans);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-body);
  max-height: 180px;
}
.gks-composer__field::placeholder { color: var(--text-subtle); }
.gks-composer__field:focus-visible { box-shadow: none; }

.gks-composer__send {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--radius-2);
  background: var(--brand-600);
  color: var(--text-inverse);
  cursor: pointer;
  transition: var(--transition-control), transform var(--dur-fast) var(--ease-standard);
}
.gks-composer__send:hover:not(:disabled) { background: var(--brand-700); }
.gks-composer__send:active:not(:disabled) { transform: scale(.94); }
.gks-composer__send:disabled { background: var(--n-200); color: var(--n-500); cursor: not-allowed; }

.gks-composer__spin { animation: gks-composer-spin 900ms linear infinite; }
@keyframes gks-composer-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .gks-composer__spin { animation: none; } }

.gks-composer__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 0 var(--sp-2);
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-composer__hint kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 1px 4px;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: 4px;
  background: var(--surface-sunken);
}
.gks-composer__count--low { color: var(--danger-fg); font-weight: var(--fw-semibold); }

/* A keyboard hint is meaningless on a phone, and the space is worth more. */
@media (max-width: 640px) {
  .gks-composer__hint { display: none; }
  .gks-composer__foot { justify-content: flex-end; }
}
</style>
