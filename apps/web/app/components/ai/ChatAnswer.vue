<script setup lang="ts">
/**
 * One answer's text — Markdown rendered, citation markers gone, and written out
 * smoothly while it streams.
 *
 * Tokens arrive in bursts: nothing for half a second, then forty characters at
 * once. Painted as they land, the bubble lurches. Instead the visible text eases
 * toward what has arrived, a few characters a frame, faster the further behind
 * it is — so a long burst is caught up in about a third of a second and a
 * trickle reads like typing. An answer that was already complete when this
 * mounted (a reload, an old conversation) is shown at once.
 *
 * A hidden tab never runs animation frames, so there the text is simply set.
 */
const props = defineProps<{ text: string; streaming: boolean }>();

const shown = ref(props.streaming ? '' : props.text);
let frame = 0;

function step(): void {
  frame = 0;
  const target = props.text;

  // The server replaced the text (a retried round, a guard caveat) — no easing
  // from something that is no longer a prefix of it.
  if (!target.startsWith(shown.value)) {
    shown.value = target;
    return;
  }

  const behind = target.length - shown.value.length;
  if (behind <= 0) return;

  shown.value = target.slice(0, shown.value.length + Math.max(2, Math.ceil(behind / 8)));
  frame = requestAnimationFrame(step);
}

watch(
  () => props.text,
  () => {
    if (import.meta.server || document.hidden) {
      shown.value = props.text;
      return;
    }
    if (!frame) frame = requestAnimationFrame(step);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
});

const html = computed(() => renderChatMarkdown(shown.value));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- escaped and tag-limited by renderChatMarkdown -->
  <div class="gks-chat-md" v-html="html" />
</template>

<style scoped>
.gks-chat-md { display: flex; flex-direction: column; gap: .55em; }
.gks-chat-md :deep(p) { margin: 0; }
.gks-chat-md :deep(ul),
.gks-chat-md :deep(ol) {
  display: flex;
  flex-direction: column;
  gap: .35em;
  margin: 0;
  padding-left: 1.25em;
}
.gks-chat-md :deep(ul) { list-style: disc; }
.gks-chat-md :deep(ol) { list-style: decimal; }
.gks-chat-md :deep(li::marker) { color: var(--brand-500); }
.gks-chat-md :deep(strong) { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-chat-md :deep(.gks-md-heading) { margin-top: .2em; }
.gks-chat-md :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-card);
  font-size: .92em;
}
.gks-chat-md :deep(a) { color: var(--brand-600); font-weight: var(--fw-semibold); text-decoration: underline; }
</style>
