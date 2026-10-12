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
  /** Who the next-step links are for — a person to reach differs (2C-04). */
  signedIn?: boolean;
  /** A turn is in flight: no chips under an answer that is about to be superseded. */
  busy?: boolean;
  /** A question waiting behind the sign-up card (2C-15) — the card replaces its answer. */
  held?: string | null;
}>();

const emit = defineEmits<{
  rate: [
    messageId: string,
    payload: { value: AiFeedbackValue; reason?: AiFeedbackReason; comment?: string },
  ];
  /** A chip or a starter was pressed: send this as the visitor's question. */
  ask: [prompt: string];
}>();

/** The latest finished answer — the only one that carries chips. */
const lastAnswerIndex = computed(() => {
  const index = props.messages.length - 1;
  const last = props.messages[index];
  return last?.role === 'ASSISTANT' && !last.pending && !props.busy ? index : -1;
});

const nextSteps = computed(() => {
  const last = props.messages[lastAnswerIndex.value];
  if (!last) return [];
  const asked = props.messages.filter((message) => message.role === 'USER').map((message) => message.content);
  return aiNextSteps(last.cards, { signedIn: Boolean(props.signedIn) }, asked);
});

/**
 * The card quotes the waiting question only when its bubble is not on screen —
 * after a reload, the bubble was never stored, but the question still was.
 */
const heldQuote = computed(() => {
  if (!props.held) return null;
  const last = props.messages[props.messages.length - 1];
  return last?.role === 'USER' && last.content === props.held ? null : props.held;
});

const scroller = ref<HTMLElement | null>(null);
const tail = ref<HTMLElement | null>(null);

/**
 * How a new answer arrives on screen — the way current chat apps do it.
 *
 * Sending scrolls the question to the **top** of the thread, and the answer is
 * written out beneath it into the space below. Nothing follows the stream down:
 * pinning the view to the bottom on every token scrolls a long answer's
 * beginning away while it is being read, so the reader starts at the first line
 * and scrolls when they choose to.
 *
 * `spacer` is what makes the first part possible: the last question can only
 * reach the top if there is at least a screen of content under it, so an empty
 * block makes up the difference and shrinks as the answer grows into it. A
 * restored conversation opens at its end, which with the spacer is the last
 * question and its answer.
 */
const spacer = ref(0);
/** Content continues below the visible area — the "jump down" button. */
const below = ref(false);

function lastQuestion(): HTMLElement | null {
  const rows = scroller.value?.querySelectorAll<HTMLElement>('[data-role="USER"]');
  return rows?.length ? rows[rows.length - 1]! : null;
}

function paddingTop(el: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(el).paddingTop) || 0;
}

function measure(): void {
  const el = scroller.value;
  const question = lastQuestion();
  if (!el || !question || !tail.value) {
    spacer.value = 0;
  } else {
    const used = tail.value.offsetTop - question.offsetTop;
    spacer.value = Math.max(0, el.clientHeight - used - paddingTop(el) * 2);
  }
  onScroll();
}

function onScroll(): void {
  const el = scroller.value;
  if (!el || !tail.value) return;
  below.value = tail.value.offsetTop - (el.scrollTop + el.clientHeight) > 40;
}

/** The newest question to the top of the thread, smoothly. */
function alignToQuestion(): void {
  nextTick(() => {
    measure();
    // The spacer has to be in the DOM before the scroll, or the browser clamps
    // the target to the old, shorter scroll height.
    nextTick(() => {
      const el = scroller.value;
      const question = lastQuestion();
      if (!el || !question) return;
      el.scrollTo({ top: question.offsetTop - paddingTop(el), behavior: 'smooth' });
    });
  });
}

function scrollToEnd(smooth = false): void {
  nextTick(() => {
    measure();
    nextTick(() => {
      const el = scroller.value;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  });
}

/** The real content's end into view — the button, not the empty space after it. */
function jumpDown(): void {
  const el = scroller.value;
  if (!el || !tail.value) return;
  el.scrollTo({ top: Math.max(0, tail.value.offsetTop - el.clientHeight + 24), behavior: 'smooth' });
}

watch(
  () => props.messages,
  (next, previous) => {
    const last = next[next.length - 1];
    const lastUser = [...next].reverse().find((message) => message.role === 'USER');
    // A question just typed here: appended to the same thread, not stored yet,
    // and either alone (held for sign-up) or followed by its pending answer.
    const sameThread = !previous?.length || next[0] === previous[0] || next[0]?.id === previous[0]?.id;
    const wasSent =
      previous !== undefined &&
      next.length > previous.length &&
      sameThread &&
      lastUser?.id === null &&
      (last === lastUser || (last?.role === 'ASSISTANT' && last.pending));

    if (wasSent) alignToQuestion();
    else if (!previous || next[0]?.id !== previous[0]?.id || next.length < previous.length) scrollToEnd();
    else nextTick(measure);
  },
  { flush: 'post' },
);

// Everything else that changes the height under the question: cards, sources,
// the rating row, chips, the activity line, the sign-up card.
watch(
  () => [lastAnswerIndex.value, props.activity?.label, props.held, nextSteps.value.length] as const,
  () => nextTick(measure),
  { flush: 'post' },
);

// The answer grows a few characters a frame inside `AiChatAnswer`, which no
// prop here sees — so the rows are watched for size instead.
let resizer: ResizeObserver | null = null;

onMounted(() => {
  if ('ResizeObserver' in window && scroller.value) {
    resizer = new ResizeObserver(() => measure());
    resizer.observe(scroller.value);
    for (const child of Array.from(scroller.value.children)) resizer.observe(child);
  }
  scrollToEnd();
});

onUpdated(() => {
  if (!resizer || !scroller.value) return;
  // `observe` on an element already observed is a no-op, so this only adds rows.
  for (const child of Array.from(scroller.value.children)) resizer.observe(child);
});

onBeforeUnmount(() => resizer?.disconnect());

defineExpose({ scrollToEnd });
</script>

<template>
  <div ref="scroller" class="gks-chat-thread" :class="{ 'gks-chat-thread--wide': wide }" @scroll.passive="onScroll">
    <!-- The empty conversation: the page draws its own; the widget's is the
         greeting and the four questions people ask first. -->
    <template v-if="!messages.length && !held">
      <slot name="empty">
        <p v-if="greeting" class="gks-chat-bubble gks-chat-bubble--ai gks-chat-bubble--greeting">
          {{ greeting }}
        </p>
        <div class="gks-chat-starters">
          <button
            v-for="starter in AI_STARTERS"
            :key="starter.label"
            type="button"
            class="gks-chat-starter"
            @click="emit('ask', starter.prompt)"
          >
            <DsIcon :name="starter.icon" :size="15" />
            {{ starter.prompt }}
          </button>
        </div>
      </slot>
    </template>

    <!-- Keyed by position: an answer gets its id when it finishes, and
         re-keying then would remount it mid-way through writing itself out. -->
    <template v-for="(message, index) in messages" :key="index">
      <div v-if="message.role === 'USER'" class="gks-chat-row gks-chat-row--user" data-role="USER">
        <p class="gks-chat-bubble gks-chat-bubble--user">{{ message.content }}</p>
      </div>

      <div v-else class="gks-chat-row">
        <div class="gks-chat-bubble gks-chat-bubble--ai gks-chat-bubble--answer">
          <AiChatAnswer v-if="message.content" :text="message.content" :streaming="message.pending" />
          <!-- An empty pending bubble is the pause before the first token; the
               dots are what stop it reading as a failure. -->
          <span v-if="message.pending" class="gks-chat-typing" aria-label="Бичиж байна">
            <i /><i /><i />
          </span>
        </div>

        <AiChatCard v-for="(card, cardIndex) in message.cards" :key="`${card.type}-${cardIndex}`" :card="card" />

        <AiChatSources v-if="message.sources.length" :sources="message.sources" />

        <AiChatFeedback
          v-if="message.id && !message.pending"
          :feedback="message.feedback"
          @rate="(payload) => emit('rate', message.id!, payload)"
        />

        <AiChatNextSteps
          v-if="index === lastAnswerIndex"
          :actions="nextSteps"
          class="gks-chat-steps"
          @ask="(prompt) => emit('ask', prompt)"
        />
      </div>
    </template>

    <div v-if="held" class="gks-chat-row">
      <AiChatGate :question="heldQuote" :compact="!wide" />
    </div>

    <p v-if="activity" class="gks-chat-activity">
      <DsIcon name="loader-circle" :size="14" />
      {{ activity.label }}
    </p>

    <span ref="tail" class="gks-chat-tail" aria-hidden="true" />
    <div class="gks-chat-spacer" :style="{ height: `${spacer}px` }" aria-hidden="true" />

    <button
      v-if="below && messages.length"
      type="button"
      class="gks-chat-jump"
      aria-label="Доош очих"
      @click="jumpDown"
    >
      <DsIcon name="arrow-down" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.gks-chat-thread {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-4);
  flex: 1;
  /* A flex child's minimum height is its content's by default, so without this
     the list grows instead of scrolling and `scrollTop` has nothing to move. */
  min-height: 0;
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
/* Rendered Markdown carries its own line breaks. */
.gks-chat-bubble--answer { white-space: normal; }

.gks-chat-tail { display: block; flex: none; height: 0; margin-top: calc(var(--sp-3) * -1); }
.gks-chat-thread--wide .gks-chat-tail { margin-top: calc(var(--sp-5) * -1); }
.gks-chat-spacer { flex: none; margin-top: calc(var(--sp-3) * -1); }
.gks-chat-thread--wide .gks-chat-spacer { margin-top: calc(var(--sp-5) * -1); }

.gks-chat-starters { display: flex; flex-direction: column; gap: var(--sp-2); align-items: flex-start; }
.gks-chat-starter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  color: var(--brand-700);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  text-align: left;
  cursor: pointer;
}
.gks-chat-starter:hover { background: var(--brand-050); }
.gks-chat-starter .gks-icon { flex: none; }

/* An answer that ends on a card needs a breath before the chips. */
.gks-chat-steps { margin-top: var(--sp-1); }

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

/* Sticky inside the scroller, so it rides the bottom edge of whatever is
   visible rather than the bottom of the transcript. */
.gks-chat-jump {
  position: sticky;
  bottom: 0;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: none;
  border: var(--border-hair) solid var(--line-soft);
  border-radius: 50%;
  background: var(--surface-card);
  box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
  color: var(--text-strong);
  cursor: pointer;
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
