<script setup lang="ts">
import type { AiChatSessionSummary } from '@gks/shared';

/**
 * The list of past conversations beside `/chat` (2C-13).
 *
 * Grouped by day the way every chat product groups them, titled by the opening
 * question, newest first. "New conversation" sits on top because it is the
 * action people come to this column for at least as often as the list itself.
 *
 * Removing a conversation is a close on the server — the office keeps the
 * transcript — so it asks once, inline, rather than through a browser dialog.
 */
const props = defineProps<{
  items: AiChatSessionSummary[];
  currentId: string | null;
  loading: boolean;
  /** A turn is streaming: switching threads mid-answer would orphan it. */
  busy?: boolean;
}>();

const emit = defineEmits<{
  open: [sessionId: string];
  remove: [sessionId: string];
  create: [];
}>();

const groups = computed(() => groupChatHistory(props.items));

/** The row whose "remove?" question is showing, if any. */
const confirming = ref<string | null>(null);

function remove(sessionId: string): void {
  confirming.value = null;
  emit('remove', sessionId);
}
</script>

<template>
  <div class="ai-history">
    <button type="button" class="ai-history__new" :disabled="busy" @click="emit('create')">
      <DsIcon name="square-pen" :size="16" />
      Шинэ яриа
    </button>

    <div class="ai-history__scroll">
      <p v-if="loading && !items.length" class="ai-history__empty">Ачаалж байна…</p>
      <p v-else-if="!items.length" class="ai-history__empty">
        Өмнөх яриа алга. Асуусан зүйлс тань энд хадгалагдана.
      </p>

      <section v-for="group in groups" :key="group.label" class="ai-history__group">
        <h3>{{ group.label }}</h3>
        <ul>
          <li
            v-for="item in group.items"
            :key="item.sessionId"
            class="ai-history__item"
            :class="{ 'ai-history__item--current': item.sessionId === currentId }"
          >
            <template v-if="confirming === item.sessionId">
              <span class="ai-history__confirm">Түүхээс хасах уу?</span>
              <button type="button" class="ai-history__yes" @click="remove(item.sessionId)">Хасах</button>
              <button type="button" class="ai-history__no" @click="confirming = null">Болих</button>
            </template>
            <template v-else>
              <button
                type="button"
                class="ai-history__open"
                :disabled="busy"
                :aria-current="item.sessionId === currentId ? 'true' : undefined"
                :title="item.title"
                @click="emit('open', item.sessionId)"
              >
                <span>{{ item.title || 'Нэргүй яриа' }}</span>
                <DsIcon v-if="item.status === 'HANDED_OFF'" name="user-round" :size="13" title="Зөвлөхөд шилжсэн" />
              </button>
              <button
                type="button"
                class="ai-history__remove"
                aria-label="Түүхээс хасах"
                @click="confirming = item.sessionId"
              >
                <DsIcon name="trash-2" :size="14" />
              </button>
            </template>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ai-history { display: flex; flex-direction: column; gap: var(--sp-3); min-height: 0; height: 100%; }

.ai-history__new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 14px;
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  color: var(--brand-700);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ai-history__new:hover:not(:disabled) { background: var(--brand-050); }
.ai-history__new:disabled { opacity: .5; cursor: default; }

.ai-history__scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-right: 2px; }

.ai-history__empty { padding: var(--sp-3) var(--sp-2); font-size: var(--fs-caption); line-height: var(--lh-body); color: var(--text-subtle); }

.ai-history__group + .ai-history__group { margin-top: var(--sp-4); }
.ai-history__group h3 {
  padding: 0 var(--sp-2) var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
}
.ai-history__group ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.ai-history__item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  border-radius: var(--radius-1);
}
.ai-history__item:hover { background: var(--surface-hover); }
.ai-history__item--current { background: var(--surface-selected); }
.ai-history__item--current:hover { background: var(--surface-selected); }

.ai-history__open {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  padding: 8px var(--sp-2);
  border: 0;
  background: none;
  color: var(--text-body);
  font: inherit;
  font-size: var(--fs-label);
  text-align: left;
  cursor: pointer;
}
.ai-history__open span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-history__item--current .ai-history__open { color: var(--brand-800); font-weight: var(--fw-semibold); }
.ai-history__open .gks-icon { flex: none; color: var(--text-subtle); }

.ai-history__remove {
  display: inline-flex;
  flex: none;
  padding: 6px;
  margin-right: 4px;
  border: 0;
  border-radius: var(--radius-1);
  background: none;
  color: var(--text-subtle);
  cursor: pointer;
  opacity: 0;
}
.ai-history__item:hover .ai-history__remove,
.ai-history__item--current .ai-history__remove,
.ai-history__remove:focus-visible { opacity: 1; }
.ai-history__remove:hover { color: var(--danger-fg); background: var(--danger-bg); }
/* No hover on a phone: the bin is always there. */
@media (hover: none) { .ai-history__remove { opacity: 1; } }

.ai-history__confirm { flex: 1; padding: 0 var(--sp-2); font-size: var(--fs-caption); color: var(--text-muted); }
.ai-history__yes,
.ai-history__no {
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-1);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.ai-history__yes { background: var(--danger-bg); color: var(--danger-fg); }
.ai-history__no { margin-right: 4px; background: none; color: var(--text-muted); }
</style>
