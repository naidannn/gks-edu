<script setup lang="ts">
/**
 * Drag-and-drop uploader for one document (1D-14). Accepted types come from the
 * template so a client never uploads something the API will reject on sniff.
 */
const props = withDefaults(
  defineProps<{
    acceptedFileTypes?: string[];
    multiple?: boolean;
    disabled?: boolean;
    busy?: boolean;
  }>(),
  { acceptedFileTypes: () => ['pdf', 'jpg', 'png'], multiple: true },
);

const emit = defineEmits<{ select: [files: File[]] }>();

const input = ref<HTMLInputElement>();
const dragging = ref(false);

const accept = computed(() => props.acceptedFileTypes.map((type) => `.${type}`).join(','));
const hint = computed(() => `${props.acceptedFileTypes.join(', ').toUpperCase()} · 20MB хүртэл`);

function pick(list: FileList | null) {
  const files = Array.from(list ?? []);
  if (files.length) emit('select', files);
  if (input.value) input.value.value = '';
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  if (!props.disabled) pick(event.dataTransfer?.files ?? null);
}
</script>

<template>
  <div
    class="gks-upload"
    :class="{ 'gks-upload--dragging': dragging, 'gks-upload--disabled': disabled || busy }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <input
      ref="input"
      type="file"
      class="gks-upload__input"
      :accept="accept"
      :multiple="multiple"
      :disabled="disabled || busy"
      @change="pick(($event.target as HTMLInputElement).files)"
    >
    <DsIcon :name="busy ? 'loader-circle' : 'upload'" :size="20" :class="{ 'gks-upload__spin': busy }" />
    <div class="gks-upload__text">
      <button type="button" class="gks-upload__button" :disabled="disabled || busy" @click="input?.click()">
        {{ busy ? 'Байршуулж байна…' : 'Файл сонгох' }}
      </button>
      <span class="gks-upload__hint">эсвэл энд чирж тавь · {{ hint }}</span>
    </div>
  </div>
</template>

<style scoped>
.gks-upload {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: var(--border-hair) dashed var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-page);
  color: var(--text-muted);
  transition: var(--transition-control);
}
.gks-upload--dragging { border-color: var(--brand-600); background: var(--surface-selected); color: var(--brand-700); }
.gks-upload--disabled { opacity: .6; }
.gks-upload__input { display: none; }
.gks-upload__text { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--sp-2); }
.gks-upload__button {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: var(--fw-semibold);
  color: var(--brand-700);
  cursor: pointer;
  text-decoration: underline;
}
.gks-upload__button:disabled { cursor: default; text-decoration: none; }
.gks-upload__hint { font-size: var(--fs-caption); }
.gks-upload__spin { animation: gks-upload-spin 1s linear infinite; }
@keyframes gks-upload-spin { to { transform: rotate(360deg); } }
</style>
