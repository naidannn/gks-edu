<script setup lang="ts">
import type { AiChatChannel } from '@gks/shared';

/**
 * "Ask the assistant" as a box on a page rather than a button to a page
 * (2C-16) — the cabinet's dashboard leads with it. The question is sent from
 * here and the visitor follows it to the full screen, where the answer is
 * already streaming: one action, not "open the chat, then type".
 *
 * The status check is the widget's own: no assistant, no card.
 */
const props = withDefaults(
  defineProps<{
    /** Where the conversation continues. */
    to?: string;
    channel?: AiChatChannel;
    title?: string;
    subtitle?: string;
  }>(),
  {
    to: '/app/assistant',
    channel: 'PORTAL',
    title: 'AI зөвлөхөөс асуух',
    subtitle: 'Таны хэрэг, материал, хугацааг мэдэж хариулна — 24/7.',
  },
);

const chat = useAiChat();
const available = ref(false);

onMounted(async () => {
  available.value = await chat.status();
});

/** Questions a client in the middle of a case asks — not the visitor's starters. */
const STARTERS = [
  'Миний дараагийн алхам юу вэ?',
  'Ямар материал дутуу байна?',
  'Визний ярилцлагад яаж бэлдэх вэ?',
];

function ask(text: string): void {
  chat.channel.value = props.channel;
  chat.newChat();
  void chat.send(text);
  void navigateTo(props.to);
}
</script>

<template>
  <section v-if="available" class="gks-ai-prompt" aria-label="AI зөвлөх">
    <div class="gks-ai-prompt__head">
      <span class="gks-ai-prompt__mark" aria-hidden="true"><DsIcon name="sparkles" :size="18" /></span>
      <div>
        <h2 class="gks-ai-prompt__title">{{ title }}</h2>
        <p class="gks-ai-prompt__sub">{{ subtitle }}</p>
      </div>
      <NuxtLink :to="to" class="gks-ai-prompt__open">Түүх <DsIcon name="arrow-right" :size="14" /></NuxtLink>
    </div>
    <div class="gks-ai-prompt__box">
      <AiChatComposer placeholder="Асуултаа бичнэ үү…" @send="ask" />
    </div>
    <div class="gks-ai-prompt__chips">
      <button v-for="starter in STARTERS" :key="starter" type="button" class="gks-ai-prompt__chip" @click="ask(starter)">
        {{ starter }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.gks-ai-prompt {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  padding: var(--sp-5);
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-4);
  background:
    radial-gradient(90% 120% at 100% 0%, rgba(124, 58, 237, .08) 0%, transparent 55%),
    radial-gradient(90% 120% at 0% 100%, var(--brand-050) 0%, transparent 60%),
    var(--surface-card);
}
.gks-ai-prompt__head { display: flex; align-items: flex-start; gap: var(--sp-3); }
.gks-ai-prompt__head > div { flex: 1; min-width: 0; }
.gks-ai-prompt__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex: none;
  border-radius: var(--radius-2);
  background: linear-gradient(135deg, var(--brand-500), #7c3aed);
  color: var(--text-inverse);
}
.gks-ai-prompt__title { font-size: var(--fs-body); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-ai-prompt__sub { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-ai-prompt__open {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
  white-space: nowrap;
}
.gks-ai-prompt__box {
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  overflow: hidden;
  background: var(--surface-card);
}
.gks-ai-prompt__box :deep(.gks-chat-composer) { border-top: 0; }
.gks-ai-prompt__chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.gks-ai-prompt__chip {
  padding: 6px 12px;
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--brand-700);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.gks-ai-prompt__chip:hover { background: var(--brand-050); }
</style>
