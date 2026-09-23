<script setup lang="ts">
import TextAlign from '@tiptap/extension-text-align';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';

/**
 * The page an essay is written on (1D-28) — a Word-like sheet with the few
 * tools a Personal Statement needs: headings, bold/italic/underline, lists,
 * alignment, undo. Nothing that would not survive a paste into the school's
 * form: no colours, fonts, links or images.
 *
 * Read-only, it is also how the client reads the essay: the HTML goes through
 * the same schema either way, so whatever the editor does not know is dropped
 * rather than rendered.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    editable?: boolean;
    placeholder?: string;
  }>(),
  { editable: false, placeholder: '' },
);

const emit = defineEmits<{
  'update:modelValue': [html: string];
  /** The passage the reader has selected — empty when nothing is. */
  select: [text: string];
}>();

const editor = useEditor({
  content: props.modelValue,
  editable: props.editable,
  extensions: [
    StarterKit.configure({ link: false, code: false, codeBlock: false, strike: false, horizontalRule: false }),
    TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
    Placeholder.configure({ placeholder: () => props.placeholder }),
  ],
  onUpdate: ({ editor: current }) => emit('update:modelValue', current.isEmpty ? '' : current.getHTML()),
});

// A reload from outside (another writer's version, a conflict) replaces the text.
watch(
  () => props.modelValue,
  (html) => {
    const current = editor.value;
    if (!current) return;
    const mine = current.isEmpty ? '' : current.getHTML();
    if (html !== mine) current.commands.setContent(html, { emitUpdate: false });
  },
);
watch(
  () => props.editable,
  (editable) => editor.value?.setEditable(editable),
);

const words = computed(() => countWords(editor.value?.getText({ blockSeparator: ' ' }) ?? ''));

const sheet = ref<HTMLElement | null>(null);
/** Read from the DOM, not the editor: a read-only editor does not track its selection. */
function reportSelection() {
  const selection = window.getSelection();
  const inside = selection?.anchorNode && sheet.value?.contains(selection.anchorNode);
  emit('select', inside ? (selection?.toString().replace(/\s+/g, ' ').trim() ?? '') : '');
}

/** Replaces the whole text — for the "start from an outline" button. */
function setContent(html: string) {
  editor.value?.commands.setContent(html, { emitUpdate: true });
  editor.value?.commands.focus('start');
}
defineExpose({ setContent, words });

interface Tool {
  icon: string;
  label: string;
  run: () => void;
  active?: () => boolean;
  disabled?: () => boolean;
}
const chain = () => editor.value!.chain().focus();
const TOOLS: Tool[][] = [
  [
    { icon: 'undo-2', label: 'Буцаах (Ctrl+Z)', run: () => chain().undo().run(), disabled: () => !editor.value?.can().undo() },
    { icon: 'redo-2', label: 'Дахих (Ctrl+Shift+Z)', run: () => chain().redo().run(), disabled: () => !editor.value?.can().redo() },
  ],
  [
    { icon: 'pilcrow', label: 'Энгийн текст', run: () => chain().setParagraph().run(), active: () => !!editor.value?.isActive('paragraph') },
    { icon: 'heading-1', label: 'Гарчиг', run: () => chain().toggleHeading({ level: 1 }).run(), active: () => !!editor.value?.isActive('heading', { level: 1 }) },
    { icon: 'heading-2', label: 'Дэд гарчиг', run: () => chain().toggleHeading({ level: 2 }).run(), active: () => !!editor.value?.isActive('heading', { level: 2 }) },
  ],
  [
    { icon: 'bold', label: 'Тод (Ctrl+B)', run: () => chain().toggleBold().run(), active: () => !!editor.value?.isActive('bold') },
    { icon: 'italic', label: 'Налуу (Ctrl+I)', run: () => chain().toggleItalic().run(), active: () => !!editor.value?.isActive('italic') },
    { icon: 'underline', label: 'Доогуур зураас (Ctrl+U)', run: () => chain().toggleUnderline().run(), active: () => !!editor.value?.isActive('underline') },
  ],
  [
    { icon: 'list', label: 'Жагсаалт', run: () => chain().toggleBulletList().run(), active: () => !!editor.value?.isActive('bulletList') },
    { icon: 'list-ordered', label: 'Дугаартай жагсаалт', run: () => chain().toggleOrderedList().run(), active: () => !!editor.value?.isActive('orderedList') },
  ],
  [
    { icon: 'align-left', label: 'Зүүн тийш', run: () => chain().setTextAlign('left').run(), active: () => !!editor.value?.isActive({ textAlign: 'left' }) },
    { icon: 'align-center', label: 'Голлуулах', run: () => chain().setTextAlign('center').run(), active: () => !!editor.value?.isActive({ textAlign: 'center' }) },
    { icon: 'align-right', label: 'Баруун тийш', run: () => chain().setTextAlign('right').run(), active: () => !!editor.value?.isActive({ textAlign: 'right' }) },
    { icon: 'align-justify', label: 'Тэгшлэх', run: () => chain().setTextAlign('justify').run(), active: () => !!editor.value?.isActive({ textAlign: 'justify' }) },
  ],
  [{ icon: 'remove-formatting', label: 'Хэлбэржүүлэлт арилгах', run: () => chain().unsetAllMarks().clearNodes().run() }],
];
</script>

<template>
  <div class="gks-essay-editor" :class="{ 'gks-essay-editor--readonly': !editable }">
    <div v-if="editable && editor" class="gks-essay-editor__toolbar" role="toolbar" aria-label="Хэлбэржүүлэлт">
      <div v-for="(group, index) in TOOLS" :key="index" class="gks-essay-editor__group">
        <button
          v-for="tool in group"
          :key="tool.icon"
          type="button"
          class="gks-essay-editor__tool"
          :class="{ 'gks-essay-editor__tool--on': tool.active?.() }"
          :title="tool.label"
          :aria-label="tool.label"
          :aria-pressed="tool.active ? tool.active() : undefined"
          :disabled="tool.disabled?.()"
          @mousedown.prevent
          @click="tool.run()"
        >
          <DsIcon :name="tool.icon" :size="16" />
        </button>
      </div>
      <span class="gks-essay-editor__words gks-tnum">{{ words }} үг</span>
    </div>

    <div class="gks-essay-editor__desk">
      <div ref="sheet" class="gks-essay-editor__sheet" @mouseup="reportSelection" @keyup="reportSelection">
        <EditorContent :editor="editor" />
      </div>
    </div>

    <p v-if="!editable" class="gks-essay-editor__footer gks-tnum">{{ words }} үг</p>
  </div>
</template>

<style scoped>
.gks-essay-editor { display: flex; flex-direction: column; border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-3); background: var(--surface-sunken); overflow: hidden; }
.gks-essay-editor__toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-essay-editor__group { display: flex; gap: 2px; padding-right: var(--sp-2); border-right: var(--border-hair) solid var(--line-hairline); }
.gks-essay-editor__group:last-of-type { border-right: 0; }
.gks-essay-editor__tool {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--radius-2);
  background: transparent;
  color: var(--text-body);
  cursor: pointer;
}
.gks-essay-editor__tool:hover:not(:disabled) { background: var(--n-100); }
.gks-essay-editor__tool:disabled { opacity: 0.35; cursor: default; }
.gks-essay-editor__tool--on { background: var(--brand-050); color: var(--brand-700); }
.gks-essay-editor__words { margin-left: auto; font-size: var(--fs-caption); color: var(--text-muted); }

.gks-essay-editor__desk { padding: var(--sp-6) var(--sp-4); overflow-x: auto; }
.gks-essay-editor__sheet {
  max-width: 794px; /* A4 at 96 dpi */
  min-height: 600px;
  margin: 0 auto;
  padding: 72px 80px;
  background: #fff;
  color: #1a1a1a;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.12), 0 4px 16px rgb(0 0 0 / 0.06);
  font-family: 'Times New Roman', 'Batang', 'AppleMyungjo', serif;
  font-size: 16px;
  line-height: 1.6;
}
.gks-essay-editor--readonly .gks-essay-editor__sheet { min-height: 0; }
.gks-essay-editor__footer { padding: 0 var(--sp-4) var(--sp-4); text-align: right; font-size: var(--fs-caption); color: var(--text-muted); }

.gks-essay-editor__sheet :deep(.tiptap) { outline: none; min-height: inherit; }
.gks-essay-editor__sheet :deep(.tiptap p) { margin: 0 0 0.75em; }
.gks-essay-editor__sheet :deep(.tiptap h1) { font-size: 1.5em; font-weight: 700; margin: 0 0 0.75em; }
.gks-essay-editor__sheet :deep(.tiptap h2) { font-size: 1.2em; font-weight: 700; margin: 1.2em 0 0.5em; }
.gks-essay-editor__sheet :deep(.tiptap h3) { font-size: 1.05em; font-weight: 700; margin: 1em 0 0.4em; }
.gks-essay-editor__sheet :deep(.tiptap ul) { list-style: disc; padding-left: 1.5em; margin: 0 0 0.75em; }
.gks-essay-editor__sheet :deep(.tiptap ol) { list-style: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }
.gks-essay-editor__sheet :deep(.tiptap blockquote) { border-left: 3px solid #ccc; padding-left: 1em; color: #444; }
.gks-essay-editor__sheet :deep(.tiptap p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: #9a9a9a;
  pointer-events: none;
}

@media (max-width: 700px) {
  .gks-essay-editor__desk { padding: var(--sp-3) 0; }
  .gks-essay-editor__sheet { padding: var(--sp-5) var(--sp-4); box-shadow: none; }
}
</style>
