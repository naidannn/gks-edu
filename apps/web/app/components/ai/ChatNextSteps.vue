<script setup lang="ts">
import type { AiChatAction } from '~/utils/ai-chat';

/**
 * The chips under the latest answer (2C-04).
 *
 * Two kinds, and they look different on purpose: a question chip continues
 * the conversation and is outlined; the one link — the step that moves the
 * visitor toward a contract or a person — is filled, because it is the step we
 * want taken. Only the latest answer has chips: an old answer's suggestions are
 * stale the moment somebody asks something else, and a thread with a row of
 * buttons under every reply reads like a form.
 */
defineProps<{ actions: AiChatAction[] }>();

const emit = defineEmits<{ ask: [prompt: string] }>();
</script>

<template>
  <nav v-if="actions.length" class="ai-steps" aria-label="Дараагийн алхам">
    <template v-for="action in actions" :key="action.label">
      <NuxtLink
        v-if="action.kind === 'link'"
        :to="action.to"
        class="ai-steps__chip"
        :class="{ 'ai-steps__chip--primary': action.primary }"
      >
        <DsIcon :name="action.icon" :size="15" />
        <span>{{ action.label }}</span>
        <DsIcon name="arrow-right" :size="14" />
      </NuxtLink>
      <button v-else type="button" class="ai-steps__chip" @click="emit('ask', action.prompt)">
        <DsIcon :name="action.icon" :size="15" />
        <span>{{ action.label }}</span>
      </button>
    </template>
  </nav>
</template>

<style scoped>
.ai-steps { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.ai-steps__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 6px 14px;
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--brand-700);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-decoration: none;
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.ai-steps__chip:hover { background: var(--brand-050); border-color: var(--brand-300); }
/* A school's full name is a chip label too; it ends in an ellipsis, not a second line. */
.ai-steps__chip span { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ai-steps__chip .gks-icon { flex: none; }
.ai-steps__chip:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

.ai-steps__chip--primary {
  border-color: var(--brand-600);
  background: var(--brand-600);
  color: var(--text-inverse);
}
.ai-steps__chip--primary:hover { background: var(--brand-700); border-color: var(--brand-700); }
</style>
