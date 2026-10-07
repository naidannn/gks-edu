<script setup lang="ts">
import { MESSENGER_IMAGE_TYPES, messengerImageProblem } from '~/composables/useMessengerThread';

/**
 * The write box (1K).
 *
 * Enter sends, Shift+Enter breaks the line — the convention every messenger
 * shares, and the one people's hands already know. The field grows with the
 * text up to six lines and then scrolls, so a long message never pushes the
 * thread off the screen.
 *
 * A photo (1K-11) can be picked with the button, pasted, or dropped on the
 * box. It waits above the field until sent, and whatever is typed beside it
 * goes as its caption. The server compresses it, so nothing is resized here.
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

const emit = defineEmits<{ send: [body: string]; sendImage: [file: File, caption: string]; typing: [] }>();

const MAX_LENGTH = 4000;
const MAX_ROWS = 6;

const body = ref('');
const field = ref<HTMLTextAreaElement | null>(null);

const picker = ref<HTMLInputElement | null>(null);
/** The photo waiting to go, with an object URL for its preview. */
const staged = ref<{ file: File; url: string } | null>(null);
const imageError = ref<string | null>(null);
const dragging = ref(false);

const canSend = computed(
  () => (body.value.trim().length > 0 || Boolean(staged.value)) && !props.disabled && !props.sending,
);
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
  if (staged.value) {
    // The thread's bubble takes over the preview, so the URL is not revoked here.
    emit('sendImage', staged.value.file, body.value.trim());
    staged.value = null;
  } else {
    emit('send', body.value.trim());
  }
  body.value = '';
  nextTick(resize);
}

function stage(file: File): void {
  const problem = messengerImageProblem(file);
  imageError.value = problem;
  if (problem) return;
  clearStaged();
  staged.value = { file, url: URL.createObjectURL(file) };
  focus();
}

function clearStaged(): void {
  if (staged.value) URL.revokeObjectURL(staged.value.url);
  staged.value = null;
}

function onPick(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Reset so picking the same file again still fires `change`.
  input.value = '';
  if (file) stage(file);
}

/** A screenshot pasted straight into the field is the most common way a photo arrives. */
function onPaste(event: ClipboardEvent): void {
  const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
  if (!file) return;
  event.preventDefault();
  stage(file);
}

function onDrop(event: DragEvent): void {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) stage(file);
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

onBeforeUnmount(clearStaged);
</script>

<template>
  <div class="gks-composer" :class="{ 'gks-composer--disabled': disabled }">
    <div v-if="staged" class="gks-composer__staged">
      <img :src="staged.url" alt="Илгээх зураг" class="gks-composer__staged-img">
      <span class="gks-composer__staged-name">{{ staged.file.name }}</span>
      <button type="button" class="gks-composer__staged-remove" aria-label="Зургийг хасах" @click="clearStaged">
        <DsIcon name="x" :size="14" />
      </button>
    </div>
    <p v-if="imageError" class="gks-composer__error" role="alert">{{ imageError }}</p>

    <div
      class="gks-composer__box"
      :class="{ 'gks-composer__box--drop': dragging }"
      @dragover.prevent="dragging = !disabled"
      @dragleave="dragging = false"
      @drop.prevent="!disabled && onDrop($event)"
    >
      <input
        ref="picker"
        type="file"
        class="gks-composer__picker"
        :accept="MESSENGER_IMAGE_TYPES.join(',')"
        tabindex="-1"
        @change="onPick"
      >
      <button
        type="button"
        class="gks-composer__attach"
        :disabled="disabled || sending"
        aria-label="Зураг хавсаргах"
        title="Зураг хавсаргах"
        @click="picker?.click()"
      >
        <DsIcon name="image-plus" :size="18" />
      </button>

      <textarea
        ref="field"
        v-model="body"
        class="gks-composer__field"
        rows="1"
        :maxlength="MAX_LENGTH"
        :placeholder="staged ? 'Тайлбар нэмэх (заавал биш)…' : placeholder"
        :disabled="disabled"
        :aria-label="placeholder"
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
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
  padding: var(--sp-2);
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
.gks-composer__box--drop { border-color: var(--line-accent); border-style: dashed; background: var(--brand-050); }

.gks-composer__picker { display: none; }
.gks-composer__attach {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-subtle);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-composer__attach:hover:not(:disabled) { background: var(--surface-sunken); color: var(--brand-600); }
.gks-composer__attach:disabled { cursor: not-allowed; opacity: .5; }

.gks-composer__staged {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  align-self: flex-start;
  max-width: 100%;
  padding: var(--sp-2);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
}
.gks-composer__staged-img {
  flex: none;
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-1, 6px);
  background: var(--surface-sunken);
}
.gks-composer__staged-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-composer__staged-remove {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-body);
  cursor: pointer;
}
.gks-composer__staged-remove:hover { background: var(--danger-bg); color: var(--danger-fg); }
.gks-composer__error { padding: 0 var(--sp-2); font-size: var(--fs-micro); color: var(--danger-fg); }

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
