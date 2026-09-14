<script setup lang="ts">
import type { AiChatChannel } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * The assistant's launcher and panel (2C-02).
 *
 * Mounted once per layout — the public site's and the cabinet's — and it draws
 * **nothing at all** until the server says the assistant is switched on
 * (`GET /ai/chat/status`). That check is the whole reason the endpoint exists: a
 * launcher that appears, is pressed and then apologises is worse than no
 * launcher, and `AiAssistantConfig.enabled` is false until the office turns the
 * assistant on (AI-ASSISTANT.md principle 8).
 *
 * When the assistant cannot answer mid-conversation — budget spent, session
 * handed to a human, the connection gone — the panel does not show an error and
 * stop. It shows the route to a person that the server named in the `fallback`
 * field: the messenger for someone signed in, the consultation form for a guest.
 * No dead ends.
 */
const props = withDefaults(defineProps<{ channel?: AiChatChannel }>(), { channel: 'WEB_WIDGET' });

const chat = useAiChat();
const auth = useAuthStore();
const route = useRoute();

const available = ref(false);
const open = ref(false);
const composer = ref<{ focus: () => void } | null>(null);

/** The `/chat` page is the same conversation full-size; no bubble on top of it. */
const suppressed = computed(() => route.path === '/chat');

onMounted(async () => {
  // Which shell the conversation started in, so the cabinet's sessions can be
  // told apart from the public site's in the reports (2E-08).
  chat.channel.value = props.channel;
  available.value = await chat.status();
  if (available.value) await chat.restore();
});

// Signing in claims the guest conversation for the account (§12.1) — the
// transcript call is what performs it, so it is re-run on the transition.
watch(
  () => auth.isAuthenticated,
  (signedIn) => {
    if (signedIn && available.value) void chat.restore();
  },
);

watch(open, (isOpen) => {
  if (!isOpen) return;
  nextTick(() => composer.value?.focus());
});

const fallbackLink = computed(() => {
  if (chat.offline.value?.fallback === 'messenger' && auth.isAuthenticated) {
    return { to: '/messages', label: 'Зөвлөхтэй чатлах' };
  }
  return { to: '/consultation', label: 'Зөвлөгөө авах хүсэлт' };
});

function send(text: string): void {
  void chat.send(text);
}

function rate(
  messageId: string,
  payload: { value: 'UP' | 'DOWN'; reason?: 'WRONG' | 'INCOMPLETE' | 'IRRELEVANT' | 'OTHER'; comment?: string },
): void {
  void chat.rate(messageId, payload.value, payload.reason, payload.comment);
}
</script>

<template>
  <div v-if="available && !suppressed" class="gks-chat-widget">
    <!-- The scrim only exists on phones, where the panel is a bottom sheet and
         the page behind it must stop taking taps. -->
    <div v-if="open" class="gks-chat-widget__scrim" @click="open = false" />

    <section v-if="open" class="gks-chat-widget__panel" aria-label="AI зөвлөх туслах">
      <header class="gks-chat-widget__head">
        <span class="gks-chat-widget__mark"><DsIcon name="bot" :size="18" /></span>
        <div class="gks-chat-widget__title">
          <strong>AI зөвлөх</strong>
          <span>Хариулт бүр эх сурвалжтай</span>
        </div>
        <NuxtLink to="/chat" class="gks-chat-widget__expand" title="Бүтэн дэлгэцээр">
          <DsIcon name="maximize-2" :size="16" />
        </NuxtLink>
        <DsIconButton icon="x" label="Хаах" size="sm" @click="open = false" />
      </header>

      <AiChatThread
        :messages="chat.messages.value"
        :greeting="chat.greeting.value"
        :activity="chat.activity.value"
        @rate="rate"
      />

      <p v-if="chat.offline.value" class="gks-chat-widget__offline">
        <DsIcon name="info" :size="14" />
        <span>{{ chat.offline.value.message }}</span>
        <NuxtLink :to="fallbackLink.to" @click="open = false">{{ fallbackLink.label }}</NuxtLink>
      </p>

      <AiChatComposer ref="composer" :disabled="chat.sending.value" @send="send" />
    </section>

    <button
      type="button"
      class="gks-chat-widget__launcher"
      :class="{ 'gks-chat-widget__launcher--open': open }"
      :aria-expanded="open"
      aria-label="AI зөвлөхтэй ярих"
      @click="open = !open"
    >
      <DsIcon :name="open ? 'chevron-down' : 'message-circle'" :size="22" />
      <span v-if="!open" class="gks-chat-widget__launcher-text">AI зөвлөх</span>
    </button>
  </div>
</template>

<style scoped>
.gks-chat-widget {
  position: fixed;
  right: var(--sp-5);
  bottom: var(--sp-5);
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--sp-3);
}

.gks-chat-widget__launcher {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: 52px;
  padding: 0 var(--sp-5);
  border: 0;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  box-shadow: 0 10px 28px rgba(15, 44, 87, .28);
  cursor: pointer;
}
.gks-chat-widget__launcher:hover { background: var(--brand-700); }
.gks-chat-widget__launcher--open { min-height: 44px; padding: 0 var(--sp-4); }

.gks-chat-widget__panel {
  display: flex;
  flex-direction: column;
  width: min(380px, calc(100vw - var(--sp-6)));
  height: min(560px, calc(100dvh - 160px));
  overflow: hidden;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-4);
  box-shadow: 0 18px 48px rgba(15, 44, 87, .22);
}

.gks-chat-widget__head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
  background: var(--surface-wash);
}
.gks-chat-widget__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--radius-2);
  background: var(--brand-100);
  color: var(--brand-700);
}
.gks-chat-widget__title { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.gks-chat-widget__title strong { font-size: var(--fs-body-sm); color: var(--text-strong); }
.gks-chat-widget__title span { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-chat-widget__expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-1);
  color: var(--text-muted);
}
.gks-chat-widget__expand:hover { background: var(--surface-card); color: var(--brand-600); }

.gks-chat-widget__offline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--sp-3) var(--sp-4);
  background: var(--surface-wash);
  border-top: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-chat-widget__offline .gks-icon { flex: none; }
.gks-chat-widget__offline a { color: var(--brand-600); font-weight: var(--fw-semibold); }

.gks-chat-widget__scrim { display: none; }

/* Phones: a bottom sheet, clear of the fixed tab bar the public layout draws. */
@media (max-width: 820px) {
  .gks-chat-widget {
    right: var(--gutter-mobile);
    bottom: calc(var(--sp-4) + 58px + env(safe-area-inset-bottom, 0px));
  }

  .gks-chat-widget__scrim {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(15, 44, 87, .32);
  }

  .gks-chat-widget__panel {
    position: fixed;
    inset: auto 0 0 0;
    width: 100%;
    height: 82dvh;
    border: 0;
    border-radius: var(--radius-4) var(--radius-4) 0 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .gks-chat-widget__launcher-text { display: none; }
  .gks-chat-widget__launcher { min-height: 48px; width: 48px; padding: 0; justify-content: center; }
}
</style>
