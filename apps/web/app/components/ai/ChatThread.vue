<script setup lang="ts">
import type { AiFeedbackReason, AiFeedbackValue } from '@gks/shared';
import type { AiChatBubble } from '~/composables/useAiChat';

/**
 * The conversation itself (2C-02), shared by the widget and `/chat`.
 *
 * Deliberately presentational: it is handed the bubbles and emits a rating, so
 * the same list renders inside a 380px panel and on a full page without either
 * of them owning the conversation. The state lives in `useAiChat`.
 */
const props = defineProps<{
  messages: AiChatBubble[];
  greeting: string | null;
  activity: { name: string; label: string } | null;
  /** Roomier bubbles and a wider column on the full page. */
  wide?: boolean;
}>();

const emit = defineEmits<{
  rate: [
    messageId: string,
    payload: { value: AiFeedbackValue; reason?: AiFeedbackReason; comment?: string },
  ];
}>();

const scroller = ref<HTMLElement | null>(null);

/**
 * Follow the answer as it streams — but only from the bottom.
 *
 * Somebody who has scrolled up to re-read an earlier answer is reading it;
 * yanking them back down every 40ms while tokens arrive makes the transcript
 * unusable exactly when it is most worth reading.
 */
const pinned = ref(true);

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;
  pinned.value = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function scrollToEnd(): void {
  if (!pinned.value) return;
  nextTick(() => {
    const el = scroller.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

watch(
  () => [props.messages.length, props.messages[props.messages.length - 1]?.content] as const,
  scrollToEnd,
  { flush: 'post' },
);

onMounted(scrollToEnd);

defineExpose({ scrollToEnd });
</script>

<template>
  <div ref="scroller" class="gks-chat-thread" :class="{ 'gks-chat-thread--wide': wide }" @scroll.passive="onScroll">
    <p v-if="greeting && !messages.length" class="gks-chat-bubble gks-chat-bubble--ai gks-chat-bubble--greeting">
      {{ greeting }}
    </p>

    <template v-for="(message, index) in messages" :key="message.id ?? `pending-${index}`">
      <div v-if="message.role === 'USER'" class="gks-chat-row gks-chat-row--user">
        <p class="gks-chat-bubble gks-chat-bubble--user">{{ message.content }}</p>
      </div>

      <div v-else class="gks-chat-row">
        <p class="gks-chat-bubble gks-chat-bubble--ai">
          <span v-if="message.content">{{ message.content }}</span>
          <!-- An empty pending bubble is the pause before the first token; the
               dots are what stop it reading as a failure. -->
          <span v-if="message.pending" class="gks-chat-typing" aria-label="Бичиж байна">
            <i /><i /><i />
          </span>
        </p>

        <AiChatSources v-if="message.sources.length" :sources="message.sources" />

        <AiChatFeedback
          v-if="message.id && !message.pending"
          :feedback="message.feedback"
          @rate="(payload) => emit('rate', message.id!, payload)"
        />
      </div>
    </template>

    <p v-if="activity" class="gks-chat-activity">
      <DsIcon name="loader-circle" :size="14" />
      {{ activity.label }}
    </p>
  </div>
</template>

<style scoped>
.gks-chat-thread {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-4);
  flex: 1;
}
.gks-chat-thread--wide { padding: var(--sp-6) 0; gap: var(--sp-5); }

.gks-chat-row { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; max-width: 100%; }
.gks-chat-row--user { align-items: flex-end; }

.gks-chat-bubble {
  max-width: 85%;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-3);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  /* Answers arrive as plain text with real newlines in them; without this a
     numbered list of documents collapses into one paragraph. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.gks-chat-thread--wide .gks-chat-bubble { max-width: 100%; font-size: var(--fs-body); }

.gks-chat-bubble--user {
  align-self: flex-end;
  background: var(--brand-600);
  color: var(--text-inverse);
  border-bottom-right-radius: 4px;
}
.gks-chat-bubble--ai {
  background: var(--surface-wash);
  border: var(--border-hair) solid var(--line-soft);
  color: var(--text-strong);
  border-bottom-left-radius: 4px;
}
.gks-chat-bubble--greeting { color: var(--text-muted); }

.gks-chat-typing { display: inline-flex; gap: 4px; align-items: center; vertical-align: middle; }
.gks-chat-typing i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: gks-chat-blink 1.2s infinite ease-in-out;
}
.gks-chat-typing i:nth-child(2) { animation-delay: .2s; }
.gks-chat-typing i:nth-child(3) { animation-delay: .4s; }

@keyframes gks-chat-blink {
  0%, 80%, 100% { opacity: .25; }
  40% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .gks-chat-typing i { animation: none; opacity: .6; }
}

.gks-chat-activity {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-chat-activity .gks-icon { animation: gks-chat-spin 1s linear infinite; }
@keyframes gks-chat-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .gks-chat-activity .gks-icon { animation: none; }
}
</style>
