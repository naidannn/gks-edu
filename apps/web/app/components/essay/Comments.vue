<script setup lang="ts">
import type { EssayDocumentComment } from '@gks/shared';

/**
 * Remarks on one essay (1D-28). The client selects a passage and says what is
 * wrong with it; the writer answers or fixes it and marks it resolved. A quote
 * is a copy of the passage, not a pointer into the text — the essay keeps
 * changing under it, and the remark should still read sensibly afterwards.
 */
const props = withDefaults(
  defineProps<{
    comments: EssayDocumentComment[];
    /** The passage selected in the essay right now. */
    quote?: string;
    canResolve?: boolean;
    canComment?: boolean;
    busy?: boolean;
    placeholder?: string;
  }>(),
  { quote: '', canResolve: false, canComment: true, busy: false, placeholder: 'Сэтгэгдлээ бичнэ үү…' },
);

const emit = defineEmits<{
  add: [comment: { body: string; quote: string | null }];
  resolve: [id: string, resolved: boolean];
  clearQuote: [];
}>();

const body = ref('');
const open = computed(() => props.comments.filter((comment) => !comment.resolvedAt));
const resolved = computed(() => props.comments.filter((comment) => comment.resolvedAt));
const shownQuote = computed(() => (props.quote.length > 300 ? `${props.quote.slice(0, 300)}…` : props.quote));

function submit() {
  const text = body.value.trim();
  if (!text) return;
  emit('add', { body: text, quote: props.quote || null });
  body.value = '';
}

const author = (comment: EssayDocumentComment) => comment.authorName ?? (comment.fromStaff ? 'Мэргэжилтэн' : 'Үйлчлүүлэгч');
</script>

<template>
  <div class="gks-essay-comments">
    <form v-if="canComment" class="gks-essay-comments__form" @submit.prevent="submit">
      <div v-if="quote" class="gks-essay-comments__quote gks-essay-comments__quote--new">
        <span>«{{ shownQuote }}»</span>
        <button type="button" aria-label="Ишлэлийг хасах" @click="emit('clearQuote')"><DsIcon name="x" :size="14" /></button>
      </div>
      <p v-else class="gks-essay-comments__hint">
        <DsIcon name="text-cursor" :size="14" /> Бичвэрээс хэсэг сонговол сэтгэгдэл тэр хэсгийн тухай болно.
      </p>
      <DsTextarea v-model="body" :rows="3" :placeholder="placeholder" @keydown.meta.enter="submit" @keydown.ctrl.enter="submit" />
      <DsButton type="submit" size="sm" variant="primary" icon-left="send" :loading="busy" :disabled="!body.trim()">
        Сэтгэгдэл үлдээх
      </DsButton>
    </form>

    <p v-if="!comments.length" class="gks-essay-comments__empty">Сэтгэгдэл алга.</p>

    <ul class="gks-essay-comments__list">
      <li v-for="comment in open" :key="comment.id" class="gks-essay-comments__item" :class="{ 'gks-essay-comments__item--staff': comment.fromStaff }">
        <p class="gks-essay-comments__who">
          <strong>{{ author(comment) }}</strong>
          <span class="gks-tnum">{{ formatDateTime(comment.createdAt) }}</span>
        </p>
        <p v-if="comment.quote" class="gks-essay-comments__quote">«{{ comment.quote }}»</p>
        <p class="gks-essay-comments__body">{{ comment.body }}</p>
        <DsButton v-if="canResolve" size="sm" variant="ghost" icon-left="check" @click="emit('resolve', comment.id, true)">
          Шийдсэн
        </DsButton>
      </li>
    </ul>

    <details v-if="resolved.length" class="gks-essay-comments__resolved">
      <summary>Шийдсэн сэтгэгдэл ({{ resolved.length }})</summary>
      <ul class="gks-essay-comments__list">
        <li v-for="comment in resolved" :key="comment.id" class="gks-essay-comments__item gks-essay-comments__item--done">
          <p class="gks-essay-comments__who">
            <strong>{{ author(comment) }}</strong>
            <span class="gks-tnum">{{ formatDateTime(comment.createdAt) }}</span>
          </p>
          <p v-if="comment.quote" class="gks-essay-comments__quote">«{{ comment.quote }}»</p>
          <p class="gks-essay-comments__body">{{ comment.body }}</p>
          <DsButton v-if="canResolve" size="sm" variant="ghost" icon-left="undo-2" @click="emit('resolve', comment.id, false)">
            Дахин нээх
          </DsButton>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.gks-essay-comments { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-essay-comments__form { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
.gks-essay-comments__form > :deep(*) { align-self: stretch; }
.gks-essay-comments__form > :last-child { align-self: flex-end; }
.gks-essay-comments__hint { display: flex; gap: var(--sp-2); align-items: center; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-essay-comments__empty { font-size: var(--fs-body-sm); color: var(--text-subtle); font-style: italic; }
.gks-essay-comments__list { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-essay-comments__item { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; padding: var(--sp-3); border: var(--border-hair) solid var(--line-hairline); border-left: 3px solid var(--amber-600); border-radius: var(--radius-2); background: var(--surface-card); }
.gks-essay-comments__item--staff { border-left-color: var(--brand-600); }
.gks-essay-comments__item--done { opacity: 0.7; border-left-color: var(--line-strong); }
.gks-essay-comments__who { display: flex; gap: var(--sp-2); flex-wrap: wrap; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-essay-comments__who strong { color: var(--text-strong); }
.gks-essay-comments__quote { font-family: 'Times New Roman', serif; font-size: var(--fs-body-sm); color: var(--text-body); background: var(--amber-050); padding: var(--sp-1) var(--sp-2); border-radius: var(--radius-1); word-break: break-word; }
.gks-essay-comments__quote--new { display: flex; gap: var(--sp-2); align-items: flex-start; justify-content: space-between; }
.gks-essay-comments__quote--new button { flex-shrink: 0; border: 0; background: none; cursor: pointer; color: var(--text-muted); }
.gks-essay-comments__body { font-size: var(--fs-body-sm); color: var(--text-strong); white-space: pre-wrap; word-break: break-word; }
.gks-essay-comments__resolved summary { cursor: pointer; font-size: var(--fs-body-sm); color: var(--text-muted); margin-bottom: var(--sp-3); }
</style>
