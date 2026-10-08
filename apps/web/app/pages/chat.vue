<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * The assistant, full size (2C-02, 2C-13).
 *
 * The same conversation as the widget — both read `useAiChat`, so opening this
 * page from the panel continues the thread rather than starting a second one.
 * What the page adds is the room the widget lacks: the earlier conversations in
 * a column beside it, the way every chat product lays them out, and an empty
 * state that shows what to ask instead of a paragraph explaining what the
 * assistant is.
 *
 * Nothing sits above the thread. A permanent header ate the top of a screen
 * whose whole job is the conversation; the one sentence of orientation lives
 * in the empty state, where it is read once, and goes away when the first
 * question is asked.
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
/** The history drawer, on a screen too narrow for the column. */
const drawer = ref(false);

onMounted(async () => {
  chat.channel.value = 'WEB_WIDGET';
  available.value = await chat.status();
  if (available.value) await chat.restore();
  // The list is readable even with the assistant switched off: switching it
  // off stops new answers, it does not take anybody's conversation away.
  void chat.loadHistory();
});

watch(
  () => auth.isAuthenticated,
  (signedIn) => {
    if (signedIn && available.value) void chat.restore();
    void chat.loadHistory();
  },
);

const empty = computed(() => !chat.messages.value.length);

const fallbackLink = computed(() => {
  if (chat.offline.value?.fallback === 'messenger' && auth.isAuthenticated) {
    return { to: '/messages', label: 'Зөвлөхтэй чатлах' };
  }
  return { to: '/consultation', label: 'Зөвлөгөө авах хүсэлт' };
});

function send(text: string): void {
  void chat.send(text);
}

function open(sessionId: string): void {
  drawer.value = false;
  void chat.open(sessionId);
}

function create(): void {
  drawer.value = false;
  chat.newChat();
}

function rate(
  messageId: string,
  payload: { value: 'UP' | 'DOWN'; reason?: 'WRONG' | 'INCOMPLETE' | 'IRRELEVANT' | 'OTHER'; comment?: string },
): void {
  void chat.rate(messageId, payload.value, payload.reason, payload.comment);
}
</script>

<template>
  <div class="gks-chat-page">
    <!-- Desktop: the list is a column. Below 900px it is a drawer. -->
    <aside class="gks-chat-page__side" aria-label="Өмнөх яриа">
      <AiChatHistory
        :items="chat.history.value"
        :current-id="chat.sessionId.value"
        :loading="chat.historyLoading.value"
        :busy="chat.sending.value"
        @open="open"
        @remove="(id) => chat.remove(id)"
        @create="create"
      />
    </aside>

    <section class="gks-chat-page__main">
      <div class="gks-chat-page__bar">
        <button type="button" class="gks-chat-page__bar-btn" @click="drawer = true">
          <DsIcon name="history" :size="18" />
          <span>Түүх</span>
        </button>
        <button
          v-if="!empty"
          type="button"
          class="gks-chat-page__bar-btn"
          :disabled="chat.sending.value"
          @click="create"
        >
          <DsIcon name="square-pen" :size="18" />
          <span>Шинэ яриа</span>
        </button>
      </div>

      <!-- `null` is "we have not asked yet"; drawing the empty state during that
           first tick would flash "off" at everyone on every load. -->
      <DsCard v-if="available === false" class="gks-chat-page__off">
        <p>
          AI зөвлөх одоогоор идэвхгүй байна. Зөвлөхтэй шууд холбогдвол бид хариулна.
        </p>
        <DsButton icon-right="arrow-right" @click="navigateTo('/consultation')">Зөвлөгөө авах</DsButton>
      </DsCard>

      <!-- The first screen: one line of orientation, the composer in the middle
           of it, and four questions to start from. -->
      <div v-else-if="available && empty" class="gks-chat-hero">
        <span class="gks-chat-hero__mark" aria-hidden="true"><DsIcon name="sparkles" :size="22" /></span>
        <h1 class="gks-chat-hero__title">
          Солонгост сурах талаар <span>юу ч асуугаарай</span>
        </h1>
        <p class="gks-chat-hero__sub">Сургууль, тэтгэлэг, элсэлт, үнэ — манай бодит мэдээллээр хариулна.</p>

        <div class="gks-chat-hero__composer">
          <AiChatComposer
            :disabled="chat.sending.value"
            placeholder="Жишээ нь: Сөүлд хэлний бэлтгэлд хэдэн төгрөг хэрэгтэй вэ?"
            @send="send"
          />
        </div>

        <div class="gks-chat-hero__starters">
          <button
            v-for="starter in AI_STARTERS"
            :key="starter.label"
            type="button"
            class="gks-chat-hero__starter"
            @click="send(starter.prompt)"
          >
            <DsIcon :name="starter.icon" :size="18" />
            <span>
              <strong>{{ starter.label }}</strong>
              <small>{{ starter.prompt }}</small>
            </span>
          </button>
        </div>

        <p v-if="chat.offline.value" class="gks-chat-page__offline">
          <DsIcon name="info" :size="15" />
          <span>{{ chat.offline.value.message }}</span>
          <NuxtLink :to="fallbackLink.to">{{ fallbackLink.label }}</NuxtLink>
        </p>
      </div>

      <template v-else-if="available">
        <AiChatThread
          wide
          :messages="chat.messages.value"
          :greeting="chat.greeting.value"
          :activity="chat.activity.value"
          :signed-in="auth.isAuthenticated"
          :busy="chat.sending.value"
          @rate="rate"
          @ask="send"
        />

        <p v-if="chat.offline.value" class="gks-chat-page__offline">
          <DsIcon name="info" :size="15" />
          <span>{{ chat.offline.value.message }}</span>
          <NuxtLink :to="fallbackLink.to">{{ fallbackLink.label }}</NuxtLink>
        </p>

        <div class="gks-chat-page__composer">
          <AiChatComposer :disabled="chat.sending.value" placeholder="Дараагийн асуултаа бичнэ үү…" @send="send" />
        </div>
      </template>
    </section>

    <!-- Phones and tablets: the same list, as a drawer from the left. -->
    <Transition name="gks-chat-drawer">
      <div v-if="drawer" class="gks-chat-drawer" @keydown.esc="drawer = false">
        <div class="gks-chat-drawer__scrim" @click="drawer = false" />
        <aside class="gks-chat-drawer__panel" aria-label="Өмнөх яриа">
          <header class="gks-chat-drawer__head">
            <strong>Өмнөх яриа</strong>
            <DsIconButton icon="x" label="Хаах" size="sm" @click="drawer = false" />
          </header>
          <AiChatHistory
            :items="chat.history.value"
            :current-id="chat.sessionId.value"
            :loading="chat.historyLoading.value"
            :busy="chat.sending.value"
            @open="open"
            @remove="(id) => chat.remove(id)"
            @create="create"
          />
        </aside>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.gks-chat-page {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: var(--sp-6);
  /* The thread scrolls inside itself, so the page needs a real height — a
     minimum lets the thread grow with every message, the window scrolls
     instead, and following the latest answer silently stops working. The
     height is the viewport less the sticky app bar (68px), the layout's top
     padding and a little air under the composer. */
  height: calc(100dvh - 68px - var(--sp-8) - var(--sp-6));
  min-height: 420px;
}
/* Below 900px the fixed tab bar takes the bottom 58px as well. */
@media (max-width: 900px) {
  .gks-chat-page {
    grid-template-columns: minmax(0, 1fr);
    height: calc(100dvh - 68px - var(--sp-8) - var(--sp-4) - 58px - env(safe-area-inset-bottom, 0px));
  }
  .gks-chat-page__side { display: none; }
}
@media (max-width: 640px) {
  .gks-chat-page { height: calc(100dvh - 68px - var(--sp-6) - var(--sp-4) - 58px - env(safe-area-inset-bottom, 0px)); }
}

.gks-chat-page__side {
  min-height: 0;
  padding-right: var(--sp-4);
  border-right: var(--border-hair) solid var(--line-soft);
}

.gks-chat-page__main {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
  max-width: 780px;
  margin: 0 auto;
}

/* Only where the column is hidden: a way to the list and to a fresh thread. */
.gks-chat-page__bar { display: none; }
@media (max-width: 900px) {
  .gks-chat-page__bar {
    display: flex;
    justify-content: space-between;
    gap: var(--sp-2);
    padding-bottom: var(--sp-2);
    border-bottom: var(--border-hair) solid var(--line-soft);
  }
}
.gks-chat-page__bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--radius-1);
  background: none;
  color: var(--text-body);
  font: inherit;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.gks-chat-page__bar-btn:hover:not(:disabled) { background: var(--surface-hover); }
.gks-chat-page__bar-btn:disabled { opacity: .5; }

.gks-chat-page__off { display: flex; flex-direction: column; gap: var(--sp-4); align-items: flex-start; margin-top: var(--sp-6); }

/* ── The first screen ─────────────────────────────────────────────────────── */

.gks-chat-hero {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--sp-4);
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-6) 0;
  text-align: center;
}
.gks-chat-hero__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand-500), #7c3aed);
  color: var(--text-inverse);
  box-shadow: 0 6px 20px rgba(37, 99, 235, .25);
}
.gks-chat-hero__title {
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
  line-height: 1.2;
  color: var(--text-strong);
}
.gks-chat-hero__title span {
  background: linear-gradient(90deg, var(--brand-600), #7c3aed);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.gks-chat-hero__sub { max-width: 46ch; font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-chat-hero__composer {
  width: 100%;
  margin-top: var(--sp-2);
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-3);
  overflow: hidden;
  box-shadow: 0 4px 18px rgba(37, 99, 235, .08);
}
.gks-chat-hero__composer :deep(.gks-chat-composer) { border-top: 0; }

.gks-chat-hero__starters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-2);
  width: 100%;
}
@media (max-width: 640px) {
  .gks-chat-hero { justify-content: flex-start; padding-top: var(--sp-5); }
  .gks-chat-hero__title { font-size: var(--fs-h3); }
  .gks-chat-hero__starters { grid-template-columns: minmax(0, 1fr); }
}
.gks-chat-hero__starter {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.gks-chat-hero__starter:hover { border-color: var(--brand-300); background: var(--brand-025); }
.gks-chat-hero__starter .gks-icon { flex: none; margin-top: 2px; color: var(--brand-600); }
.gks-chat-hero__starter span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gks-chat-hero__starter strong { font-size: var(--fs-label); color: var(--text-strong); }
.gks-chat-hero__starter small { font-size: var(--fs-caption); color: var(--text-muted); }

/* ── Thread ──────────────────────────────────────────────────────────────── */

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
  text-align: left;
}
.gks-chat-page__offline .gks-icon { flex: none; }
.gks-chat-page__offline a { color: var(--brand-600); font-weight: var(--fw-semibold); }

.gks-chat-page__composer {
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  overflow: hidden;
}
.gks-chat-page__composer :deep(.gks-chat-composer) { border-top: 0; }

/* ── Drawer ──────────────────────────────────────────────────────────────── */

.gks-chat-drawer { position: fixed; inset: 0; z-index: 60; }
.gks-chat-drawer__scrim { position: absolute; inset: 0; background: rgba(15, 31, 74, .35); }
.gks-chat-drawer__panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: min(320px, 86vw);
  padding: var(--sp-4);
  padding-bottom: calc(var(--sp-4) + env(safe-area-inset-bottom, 0px));
  background: var(--surface-card);
  box-shadow: 4px 0 24px rgba(15, 31, 74, .18);
}
.gks-chat-drawer__panel > .ai-history { flex: 1; min-height: 0; }
.gks-chat-drawer__head { display: flex; align-items: center; justify-content: space-between; }

.gks-chat-drawer-enter-active,
.gks-chat-drawer-leave-active { transition: opacity .2s ease; }
.gks-chat-drawer-enter-active .gks-chat-drawer__panel,
.gks-chat-drawer-leave-active .gks-chat-drawer__panel { transition: transform .2s ease; }
.gks-chat-drawer-enter-from,
.gks-chat-drawer-leave-to { opacity: 0; }
.gks-chat-drawer-enter-from .gks-chat-drawer__panel,
.gks-chat-drawer-leave-to .gks-chat-drawer__panel { transform: translateX(-100%); }
@media (prefers-reduced-motion: reduce) {
  .gks-chat-drawer-enter-active,
  .gks-chat-drawer-leave-active,
  .gks-chat-drawer-enter-active .gks-chat-drawer__panel,
  .gks-chat-drawer-leave-active .gks-chat-drawer__panel { transition: none; }
}
</style>
