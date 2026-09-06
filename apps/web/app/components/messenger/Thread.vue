<script setup lang="ts">
import type { ConversationDetail } from '@gks/shared';
import type { PendingMessage } from '~/composables/useMessengerThread';

/**
 * The thread pane (1K): everything between the header and the composer.
 *
 * It owns three behaviours that a chat lives or dies by:
 *
 * - **Scroll anchoring.** New messages scroll into view only when the reader
 *   is already at the bottom. Yanking someone away from a message they are
 *   half-way through reading is how a chat loses their trust.
 * - **Older pages keep their place.** Loading upward restores the scroll
 *   offset, so the message you were reading stays exactly where it was.
 * - **Runs of messages group.** Consecutive lines from the same person inside
 *   five minutes share one avatar, one name and one clock, which is what makes
 *   a long thread readable instead of a wall of repeated furniture.
 */
const props = defineProps<{
  conversation: ConversationDetail | null;
  messages: PendingMessage[];
  /** True when the reader is staff — it decides which side is "mine". */
  viewerIsStaff: boolean;
  pending?: boolean;
  sending?: boolean;
  loadingOlder?: boolean;
  hasOlder?: boolean;
  isTyping?: boolean;
  typingName?: string | null;
  otherReadAt?: string | null;
  /** Wording for the composer's placeholder — the two sides say it differently. */
  placeholder?: string;
}>();

const emit = defineEmits<{
  send: [body: string];
  typing: [];
  retry: [message: PendingMessage];
  loadOlder: [];
  read: [];
}>();

/** Two messages this far apart start a new run even from the same sender. */
const GROUP_WINDOW_MS = 5 * 60_000;
/** Anywhere inside this of the bottom counts as "following the conversation". */
const STICK_THRESHOLD_PX = 120;

const scroller = ref<HTMLElement | null>(null);
const composer = ref<{ focus: () => void } | null>(null);
const atBottom = ref(true);

const isOwn = (message: PendingMessage): boolean => message.fromStaff === props.viewerIsStaff;

/**
 * The rendered list: each message with the grouping flags and, where the day
 * changes, the separator that goes above it.
 */
const rows = computed(() =>
  props.messages.map((message, index) => {
    const previous = props.messages[index - 1];
    const next = props.messages[index + 1];

    // Both ends are optional: the first message has nothing before it and the
    // last has nothing after it, and each of those simply ends the run.
    const sameRun = (a: PendingMessage | undefined, b: PendingMessage | undefined) =>
      Boolean(
        a &&
          b &&
          a.kind === 'TEXT' &&
          b.kind === 'TEXT' &&
          a.fromStaff === b.fromStaff &&
          (a.sender?.id ?? null) === (b.sender?.id ?? null) &&
          Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_WINDOW_MS,
      );

    const dayLabel =
      !previous || messageDay(previous.createdAt) !== messageDay(message.createdAt)
        ? messageDay(message.createdAt)
        : null;

    return {
      message,
      dayLabel,
      // A day separator always starts a new run, whatever the clock says.
      leading: Boolean(dayLabel) || !sameRun(previous, message),
      // A run also ends at midnight: two messages two minutes apart can still
      // land on either side of a day separator.
      trailing:
        !next || !sameRun(message, next) || messageDay(next.createdAt) !== messageDay(message.createdAt),
    };
  }),
);

/**
 * The one own message that carries the "Уншсан" mark: the last one the other
 * side had already read. Marking every bubble would be noise.
 */
const readMarkId = computed(() => {
  if (!props.otherReadAt) return null;
  const readAt = new Date(props.otherReadAt).getTime();
  const own = props.messages.filter((item) => isOwn(item) && !item.pending && !item.failed);
  const last = [...own].reverse().find((item) => new Date(item.createdAt).getTime() <= readAt);
  return last?.id ?? null;
});

function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
  const el = scroller.value;
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
}

function onScroll(): void {
  const el = scroller.value;
  if (!el) return;

  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  if (atBottom.value && props.conversation?.unread) emit('read');

  if (el.scrollTop < 80 && props.hasOlder && !props.loadingOlder) {
    // Remember where the top of the content was, so restoring the offset
    // after the older page is prepended keeps the view still.
    const before = el.scrollHeight;
    emit('loadOlder');
    void nextTick(() => {
      const after = scroller.value?.scrollHeight ?? before;
      if (scroller.value) scroller.value.scrollTop = after - before;
    });
  }
}

watch(
  () => props.messages.length,
  (next, previous) => {
    // Only follow growth at the bottom; a prepended older page must not scroll.
    if (next <= (previous ?? 0)) return;
    void nextTick(() => {
      if (atBottom.value) scrollToBottom('smooth');
    });
  },
);

watch(
  () => props.conversation?.id,
  () => {
    atBottom.value = true;
    void nextTick(() => {
      scrollToBottom();
      composer.value?.focus();
    });
  },
);

onMounted(() => nextTick(() => scrollToBottom()));

const resolved = computed(() => props.conversation?.status === 'RESOLVED');
</script>

<template>
  <section class="gks-thread">
    <header class="gks-thread__head">
      <slot name="header" />
    </header>

    <div ref="scroller" class="gks-thread__scroll" @scroll.passive="onScroll">
      <div v-if="pending" class="gks-thread__loading">
        <span v-for="n in 3" :key="n" class="gks-thread__skeleton" :class="`gks-thread__skeleton--${n}`" />
      </div>

      <template v-else>
        <div v-if="loadingOlder" class="gks-thread__older">Хуучин мессежүүдийг ачаалж байна…</div>
        <!-- No date here: the day separator immediately below carries it. -->
        <p v-else-if="!hasOlder && messages.length" class="gks-thread__start">Чатын эхлэл</p>

        <template v-for="row in rows" :key="row.message.id">
          <div v-if="row.dayLabel" class="gks-thread__day"><span>{{ row.dayLabel }}</span></div>
          <MessengerBubble
            :message="row.message"
            :own="isOwn(row.message)"
            :leading="row.leading"
            :trailing="row.trailing"
            :read-mark="row.message.id === readMarkId"
            @retry="$emit('retry', $event)"
          />
        </template>

        <div v-if="isTyping" class="gks-thread__typing">
          <span class="gks-thread__typing-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>{{ typingName }} бичиж байна…</span>
        </div>
      </template>
    </div>

    <!-- Only offered when it would actually do something: the reader has
         scrolled up and there is something below them. -->
    <Transition name="gks-thread-jump">
      <button
        v-if="!atBottom && messages.length"
        type="button"
        class="gks-thread__jump"
        aria-label="Хамгийн сүүлийн мессеж рүү"
        @click="scrollToBottom('smooth')"
      >
        <DsIcon name="arrow-down" :size="16" />
        <span v-if="conversation?.unread" class="gks-thread__jump-count gks-tnum">{{ conversation.unread }}</span>
      </button>
    </Transition>

    <footer class="gks-thread__foot">
      <p v-if="resolved" class="gks-thread__resolved">
        <DsIcon name="circle-check" :size="15" />
        Энэ асуулт шийдвэрлэгдсэн гэж тэмдэглэгдсэн. Нэмж бичвэл чат дахин нээгдэнэ.
      </p>
      <MessengerComposer
        ref="composer"
        :placeholder="placeholder"
        :sending="sending"
        @send="emit('send', $event)"
        @typing="emit('typing')"
      />
    </footer>
  </section>
</template>

<style scoped>
.gks-thread {
  position: relative;
  display: flex;
  flex-direction: column;
  /* Stretch to the pane rather than resolving a percentage against it: the
     pane's own height comes from flex layout, which a `height: 100%` child
     cannot resolve against. */
  flex: 1;
  min-height: 0;
  background: var(--surface-page);
}

.gks-thread__head {
  flex: none;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}

.gks-thread__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--sp-4) var(--sp-6) var(--sp-6);
  scrollbar-width: thin;
}

.gks-thread__day {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin: var(--sp-6) 0 var(--sp-2);
}
.gks-thread__day::before,
.gks-thread__day::after { content: ''; flex: 1; height: 1px; background: var(--line-soft); }
.gks-thread__day span {
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}

.gks-thread__older,
.gks-thread__start {
  padding: var(--sp-3) 0;
  text-align: center;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}

.gks-thread__loading { display: flex; flex-direction: column; gap: var(--sp-4); padding-top: var(--sp-4); }
.gks-thread__skeleton {
  height: 44px;
  border-radius: var(--radius-3);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-thread-shimmer 1.4s ease-in-out infinite;
}
.gks-thread__skeleton--1 { width: 58%; }
.gks-thread__skeleton--2 { width: 44%; margin-left: auto; }
.gks-thread__skeleton--3 { width: 66%; }
@keyframes gks-thread-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .gks-thread__skeleton { animation: none; } }

.gks-thread__typing {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  padding-left: 42px;
  font-size: var(--fs-micro);
  color: var(--text-subtle);
}
.gks-thread__typing-dots { display: inline-flex; gap: 3px; }
.gks-thread__typing-dots i {
  width: 5px;
  height: 5px;
  border-radius: var(--radius-pill);
  background: var(--n-400);
  animation: gks-thread-blink 1.2s ease-in-out infinite;
}
.gks-thread__typing-dots i:nth-child(2) { animation-delay: .18s; }
.gks-thread__typing-dots i:nth-child(3) { animation-delay: .36s; }
@keyframes gks-thread-blink { 0%, 60%, 100% { opacity: .25; } 30% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .gks-thread__typing-dots i { animation: none; opacity: .6; } }

.gks-thread__jump {
  position: absolute;
  right: var(--sp-6);
  bottom: 112px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 34px;
  padding: 0 var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-muted);
  box-shadow: var(--shadow-card);
  cursor: pointer;
}
.gks-thread__jump:hover { color: var(--brand-700); border-color: var(--line-accent); }
.gks-thread__jump-count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
}
.gks-thread-jump-enter-active, .gks-thread-jump-leave-active { transition: opacity var(--dur-fast) var(--ease-standard); }
.gks-thread-jump-enter-from, .gks-thread-jump-leave-to { opacity: 0; }

.gks-thread__foot {
  flex: none;
  padding: var(--sp-4) var(--sp-6) var(--sp-5);
  border-top: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-thread__resolved {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--success-bg);
  color: var(--success-fg);
  font-size: var(--fs-micro);
}

@media (max-width: 640px) {
  .gks-thread__scroll { padding: var(--sp-3) var(--gutter-mobile) var(--sp-5); }
  .gks-thread__foot { padding: var(--sp-3) var(--gutter-mobile) var(--sp-4); }
  .gks-thread__jump { right: var(--gutter-mobile); bottom: 104px; }
}
</style>
