<script setup lang="ts">
/**
 * One file, picked, in the shape the material checklist already taught people
 * (`DocumentsUploadZone`): a dashed frame you can drop onto.
 *
 * The native `<input type="file">` renders a grey "Choose file" button that
 * belongs to no design system and reads as a hole in the card — which is what
 * it looked like next to the contract's own fields. This wraps it instead:
 * the input is still the control, it is just never the thing you see.
 */
const props = withDefaults(
  defineProps<{
    modelValue: File | null;
    label?: string;
    accept?: string;
    /** What is accepted, in words — shown under the button. */
    hint?: string;
    disabled?: boolean;
  }>(),
  { accept: 'application/pdf,image/jpeg,image/png', hint: 'PDF, JPG, PNG' },
);

const emit = defineEmits<{ 'update:modelValue': [file: File | null] }>();

const input = ref<HTMLInputElement>();
const dragging = ref(false);
const fieldId = useId();

function pick(list: FileList | null) {
  emit('update:modelValue', list?.[0] ?? null);
}

/** Clearing the model is not enough — the native input keeps its own value. */
function clear() {
  emit('update:modelValue', null);
  if (input.value) input.value.value = '';
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  if (!props.disabled) pick(event.dataTransfer?.files ?? null);
}

function formatSize(bytes: number): string {
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
}
</script>

<template>
  <div class="gks-field">
    <label v-if="label" :for="fieldId" class="gks-field__label">{{ label }}</label>

    <div
      class="gks-filefield"
      :class="{ 'gks-filefield--dragging': dragging, 'gks-filefield--disabled': disabled, 'gks-filefield--filled': modelValue }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <input
        :id="fieldId"
        ref="input"
        type="file"
        class="gks-filefield__input"
        :accept="accept"
        :disabled="disabled"
        @change="pick(($event.target as HTMLInputElement).files)"
      >

      <template v-if="modelValue">
        <DsIcon name="file-text" :size="18" />
        <span class="gks-filefield__name">{{ modelValue.name }}</span>
        <span class="gks-filefield__size gks-tnum">{{ formatSize(modelValue.size) }}</span>
        <button type="button" class="gks-filefield__clear" aria-label="Файлыг арилгах" @click="clear">
          <DsIcon name="x" :size="16" />
        </button>
      </template>

      <template v-else>
        <DsIcon name="upload" :size="18" />
        <div class="gks-filefield__text">
          <button type="button" class="gks-filefield__button" :disabled="disabled" @click="input?.click()">
            Файл сонгох
          </button>
          <span class="gks-filefield__hint">эсвэл энд чирж тавь · {{ hint }}</span>
        </div>
      </template>
    </div>
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

.gks-filefield {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: var(--control-md);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) dashed var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-page);
  color: var(--text-muted);
  transition: var(--transition-control);
}
.gks-filefield--dragging { border-color: var(--brand-600); background: var(--surface-selected); color: var(--brand-700); }
.gks-filefield--filled { border-style: solid; border-color: var(--line-hairline); background: var(--surface-card); color: var(--text-body); }
.gks-filefield--disabled { opacity: .6; }
.gks-filefield__input { display: none; }

.gks-filefield__text { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-2); }
.gks-filefield__button {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: var(--fw-semibold);
  color: var(--brand-700);
  cursor: pointer;
  text-decoration: underline;
}
.gks-filefield__button:disabled { cursor: default; text-decoration: none; }
.gks-filefield__hint { font-size: var(--fs-caption); }

.gks-filefield__name { flex: 1; min-width: 0; font-size: var(--fs-body-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gks-filefield__size { flex: none; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-filefield__clear {
  flex: none;
  display: inline-flex;
  border: 0;
  padding: 2px;
  background: none;
  color: var(--text-subtle);
  cursor: pointer;
}
.gks-filefield__clear:hover { color: var(--danger-fg); }
</style>
