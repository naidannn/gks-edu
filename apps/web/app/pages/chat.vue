<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * The assistant, full size (2C-02).
 *
 * The same conversation as the widget — both read `useAiChat`, so opening this
 * page from the panel continues the thread rather than starting a second one.
 * It exists for the questions that do not fit a 380px box: a list of documents,
 * a comparison of two schools, anything somebody wants to read properly or send
 * to themselves.
 *
 * `noindex, nofollow`, and disallowed in `robots.txt` besides. A conversation is
 * not a landing page: it has no stable content, and an indexed one would put a
 * half-answered question in a search result. Both are needed — `robots.txt`
 * stops the crawl, and only the meta tag stops an inbound link from putting the
 * URL in an index anyway.
 */
definePageMeta({ layout: 'default' });
useNoIndex();
useHead({ title: 'AI зөвлөх' });

const chat = useAiChat();
const auth = useAuthStore();

const available = ref<boolean | null>(null);

onMounted(async () => {
  chat.channel.value = 'WEB_WIDGET';
  available.value = await chat.status();
  if (available.value) await chat.restore();
});

watch(
  () => auth.isAuthenticated,
  (signedIn) => {
    if (signedIn && available.value) void chat.restore();
  },
);

const fallbackLink = computed(() => {
  if (chat.offline.value?.fallback === 'messenger' && auth.isAuthenticated) {
    return { to: '/messages', label: 'Зөвлөхтэй чатлах' };
  }
  return { to: '/consultation', label: 'Зөвлөгөө авах хүсэлт' };
});

function rate(
  messageId: string,
  payload: { value: 'UP' | 'DOWN'; reason?: 'WRONG' | 'INCOMPLETE' | 'IRRELEVANT' | 'OTHER'; comment?: string },
): void {
  void chat.rate(messageId, payload.value, payload.reason, payload.comment);
}
</script>

<template>
  <div class="gks-chat-page">
    <header class="gks-chat-page__head">
      <div>
        <h1>AI зөвлөх</h1>
        <p>
          Сургууль, хөтөлбөр, үнэ, элсэлтийн хугацааны талаар асууна уу. Хариулт бүр
          мэдлэгийн сан эсвэл манай бодит мэдээллээс гарах бөгөөд эх сурвалжаа зааж өгнө.
        </p>
      </div>
      <DsButton
        v-if="chat.messages.value.length"
        variant="secondary"
        size="sm"
        icon-left="rotate-ccw"
        @click="chat.reset()"
      >
        Шинэ яриа
      </DsButton>
    </header>

    <!-- `null` is "we have not asked yet"; drawing the empty state during that
         first tick would flash "off" at everyone on every load. -->
    <DsCard v-if="available === false" class="gks-chat-page__off">
      <p>
        AI зөвлөх одоогоор идэвхгүй байна. Зөвлөхтэй шууд холбогдвол бид хариулна.
      </p>
      <DsButton icon-right="arrow-right" @click="navigateTo('/consultation')">Зөвлөгөө авах</DsButton>
    </DsCard>

    <template v-else-if="available">
      <AiChatThread
        wide
        :messages="chat.messages.value"
        :greeting="chat.greeting.value"
        :activity="chat.activity.value"
        @rate="rate"
      />

      <p v-if="chat.offline.value" class="gks-chat-page__offline">
        <DsIcon name="info" :size="15" />
        <span>{{ chat.offline.value.message }}</span>
        <NuxtLink :to="fallbackLink.to">{{ fallbackLink.label }}</NuxtLink>
      </p>

      <div class="gks-chat-page__composer">
        <AiChatComposer :disabled="chat.sending.value" @send="(text) => chat.send(text)" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.gks-chat-page {
  display: flex;
  flex-direction: column;
  max-width: 760px;
  margin: 0 auto;
  /* The thread scrolls inside itself, so the page must not scroll too — two
     scrollbars racing each other is how "jump to the latest" stops working. */
  min-height: calc(100dvh - 260px);
}

.gks-chat-page__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-bottom: var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
}
.gks-chat-page__head h1 {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.gks-chat-page__head p {
  margin-top: var(--sp-2);
  max-width: 58ch;
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--text-muted);
}

.gks-chat-page__off { display: flex; flex-direction: column; gap: var(--sp-4); align-items: flex-start; margin-top: var(--sp-6); }

.gks-chat-page__offline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--surface-wash);
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}
.gks-chat-page__offline .gks-icon { flex: none; }
.gks-chat-page__offline a { color: var(--brand-600); font-weight: var(--fw-semibold); }

.gks-chat-page__composer {
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  overflow: hidden;
}
.gks-chat-page__composer :deep(.gks-chat-composer) { border-top: 0; }
</style>
