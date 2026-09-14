<script setup lang="ts">
import type { AiSource } from '@gks/shared';

/**
 * Where an answer came from (2C-11).
 *
 * Every answer the assistant gives is built from something: a document in the
 * knowledge base, or a live lookup in our own tables. Showing which is not
 * decoration — it is how a visitor can tell an answer that was read off a price
 * table from one that was improvised, and how a consultant can check a claim
 * without replaying the conversation.
 *
 * The markers (`K1`, `T2`) are the ones the answer text itself carries, so a
 * sentence can be traced to its row in this list. Collapsed by default: the
 * answer is what was asked for, the provenance is what is asked for second.
 */
defineProps<{ sources: AiSource[] }>();

const open = ref(false);
</script>

<template>
  <div class="gks-chat-sources">
    <button type="button" class="gks-chat-sources__toggle" :aria-expanded="open" @click="open = !open">
      <DsIcon :name="open ? 'chevron-down' : 'chevron-right'" :size="13" />
      Эх сурвалж ({{ sources.length }})
    </button>

    <ul v-if="open" class="gks-chat-sources__list">
      <li v-for="source in sources" :key="source.ref">
        <span class="gks-chat-sources__ref">{{ source.ref }}</span>
        <span class="gks-chat-sources__title">
          {{ source.title }}
          <span v-if="source.heading" class="gks-chat-sources__heading">· {{ source.heading }}</span>
        </span>
        <DsBadge :tone="source.kind === 'tool' ? 'success' : 'neutral'">
          {{ source.kind === 'tool' ? 'Системийн мэдээлэл' : 'Мэдлэгийн сан' }}
        </DsBadge>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.gks-chat-sources { max-width: 100%; }
.gks-chat-sources__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 0;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  background: none;
  border: 0;
  cursor: pointer;
}
.gks-chat-sources__toggle:hover { color: var(--brand-600); }

.gks-chat-sources__list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin: var(--sp-2) 0 0;
  padding: var(--sp-3);
  list-style: none;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
}
.gks-chat-sources__list li {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
}
.gks-chat-sources__ref {
  flex: none;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--brand-100);
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
}
.gks-chat-sources__title { color: var(--text-strong); }
.gks-chat-sources__heading { color: var(--text-muted); }
</style>
