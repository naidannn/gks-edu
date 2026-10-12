<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * The landing page leads with the assistant (2C-14).
 *
 * One question box at the top of the site, the way Perplexity and ChatGPT open
 * — none of the study-abroad agencies we compete with put one there, which is
 * the point. The conversation opens **in place**: the box grows into the
 * thread, so the visitor never leaves the page they landed on to read the
 * answer; "Бүтэн дэлгэц" carries the same thread to `/chat` for anyone who
 * wants the history column.
 *
 * - The placeholder cycles through real questions, because an empty box asks
 *   the visitor to invent one and most will not.
 * - The first send from here starts a fresh thread, like a chat product's home
 *   screen — an old conversation restored by the widget is still in the
 *   history, it just does not take over the hero.
 * - While the hero is on screen the floating launcher hides (`ai:inlineVisible`);
 *   two ways into the same conversation in one viewport is one too many.
 * - A guest's allowance (2C-15) is said under the box from the first screen.
 */
const chat = useAiChat();
const auth = useAuthStore();

/** Only what was started here opens the hero — see above. */
const started = ref(false);
const active = computed(() => started.value && (chat.messages.value.length > 0 || Boolean(chat.held.value)));

const EXAMPLES = [
  'GKS тэтгэлэгт тэнцэх боломж надад бий юу?',
  'Сөүлд хэлний бэлтгэлд жилд хэдэн төгрөг хэрэгтэй вэ?',
  'Бизнесийн удирдлагаар сурах сайн сургуулиуд аль нь вэ?',
  'Ойрын элсэлтийн бүртгэл хэзээ хаагдах вэ?',
  'Солонгос хэлгүйгээр бакалаврт сурч болох уу?',
];
const exampleIndex = ref(0);
const placeholder = computed(() => `Жишээ нь: ${EXAMPLES[exampleIndex.value]}`);
let rotation: ReturnType<typeof setInterval> | null = null;

const card = ref<HTMLElement | null>(null);
const inlineVisible = useState<boolean>('ai:inlineVisible', () => false);
let observer: IntersectionObserver | null = null;

onMounted(async () => {
  chat.channel.value = 'WEB_WIDGET';
  // For the allowance line; the greeting and the switch were settled on the server.
  void chat.status();

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rotation = setInterval(() => {
      exampleIndex.value = (exampleIndex.value + 1) % EXAMPLES.length;
    }, 3500);
  }

  if (card.value && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(
      ([entry]) => {
        inlineVisible.value = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.15 },
    );
    observer.observe(card.value);
  }
});

onBeforeUnmount(() => {
  if (rotation) clearInterval(rotation);
  observer?.disconnect();
  inlineVisible.value = false;
});

function send(text: string): void {
  if (!started.value) {
    started.value = true;
    chat.newChat();
  }
  void chat.send(text);
}

function restart(): void {
  chat.newChat();
  started.value = false;
}

function rate(
  messageId: string,
  payload: { value: 'UP' | 'DOWN'; reason?: 'WRONG' | 'INCOMPLETE' | 'IRRELEVANT' | 'OTHER'; comment?: string },
): void {
  void chat.rate(messageId, payload.value, payload.reason, payload.comment);
}

const fallbackLink = computed(() =>
  chat.offline.value?.fallback === 'messenger' && auth.isAuthenticated
    ? { to: '/messages', label: 'Зөвлөхтэй чатлах' }
    : { to: '/consultation', label: 'Зөвлөгөө авах хүсэлт' },
);

const TRUST = [
  { icon: 'badge-check', text: 'Үнэгүй' },
  { icon: 'database', text: '135 сургуулийн бодит мэдээлэл' },
  { icon: 'quote', text: 'Хариулт бүр эх сурвалжтай' },
  { icon: 'user-round', text: 'Хүссэн үедээ зөвлөхтэй' },
];
</script>

<template>
  <section class="gks-ai-hero" :class="{ 'gks-ai-hero--active': active }" aria-labelledby="gks-ai-hero-title">
    <div class="gks-ai-hero__glow" aria-hidden="true" />

    <span class="gks-ai-hero__eyebrow">
      <DsIcon name="sparkles" :size="14" />
      Шинэ · AI зөвлөх 24/7
    </span>
    <h1 id="gks-ai-hero-title" class="gks-ai-hero__title">
      Солонгост сурах бүх асуултаа <span>AI зөвлөхөөс асуугаарай</span>
    </h1>
    <p class="gks-ai-hero__lede">
      Танд аль сургууль тохирох, хэдэн төгрөг хэрэгтэй, GKS тэтгэлэгт тэнцэх эсэх — 24/7, үнэгүй, хэдхэн секундэд хариулна.
    </p>

    <div ref="card" class="gks-ai-hero__card">
      <template v-if="active">
        <header class="gks-ai-hero__bar">
          <span class="gks-ai-hero__bar-mark" aria-hidden="true"><DsIcon name="sparkles" :size="15" /></span>
          <strong>AI зөвлөх</strong>
          <span class="gks-ai-hero__bar-spacer" />
          <button type="button" class="gks-ai-hero__bar-btn" :disabled="chat.sending.value" @click="restart">
            <DsIcon name="square-pen" :size="15" />
            <span>Шинэ яриа</span>
          </button>
          <NuxtLink to="/chat" class="gks-ai-hero__bar-btn">
            <DsIcon name="maximize-2" :size="15" />
            <span>Бүтэн дэлгэц</span>
          </NuxtLink>
        </header>

        <AiChatThread
          class="gks-ai-hero__thread"
          :messages="chat.messages.value"
          :greeting="chat.greeting.value"
          :activity="chat.activity.value"
          :signed-in="auth.isAuthenticated"
          :busy="chat.sending.value"
          :held="chat.held.value"
          @rate="rate"
          @ask="send"
        />

        <p v-if="chat.offline.value" class="gks-ai-hero__offline">
          <DsIcon name="info" :size="14" />
          <span>{{ chat.offline.value.message }}</span>
          <NuxtLink :to="fallbackLink.to">{{ fallbackLink.label }}</NuxtLink>
        </p>
      </template>

      <AiChatComposer
        class="gks-ai-hero__composer"
        :disabled="chat.sending.value || (active && Boolean(chat.held.value))"
        :placeholder="active ? (chat.held.value ? 'Бүртгүүлээд үргэлжлүүлнэ үү' : 'Дараагийн асуултаа бичнэ үү…') : placeholder"
        @send="send"
      />
    </div>

    <div v-if="!active" class="gks-ai-hero__starters">
      <button
        v-for="starter in AI_STARTERS"
        :key="starter.label"
        type="button"
        class="gks-ai-hero__starter"
        :title="starter.prompt"
        @click="send(starter.prompt)"
      >
        <DsIcon :name="starter.icon" :size="15" />
        {{ starter.label }}
      </button>
    </div>


    <ul class="gks-ai-hero__trust">
      <li v-for="item in TRUST" :key="item.text">
        <DsIcon :name="item.icon" :size="14" />
        {{ item.text }}
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gks-ai-hero {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-10) var(--sp-6) var(--sp-8);
  overflow: hidden;
  border: var(--border-hair) solid var(--brand-100);
  border-radius: var(--radius-4);
  background: var(--surface-wash);
  text-align: center;
}

/* Two soft colour fields behind the box — the "AI" cue without an illustration. */
.gks-ai-hero__glow {
  position: absolute;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(45% 60% at 18% 8%, rgba(59, 130, 246, .16) 0%, transparent 70%),
    radial-gradient(40% 55% at 85% 20%, rgba(124, 58, 237, .13) 0%, transparent 70%),
    radial-gradient(60% 50% at 50% 100%, rgba(59, 130, 246, .08) 0%, transparent 70%);
}

.gks-ai-hero__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px var(--sp-3);
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--brand-700);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
}
.gks-ai-hero__eyebrow .gks-icon { color: #7c3aed; }

.gks-ai-hero__title {
  max-width: 22ch;
  font-family: var(--font-display);
  font-size: clamp(28px, 3.8vw, 46px);
  font-weight: var(--fw-black);
  line-height: var(--lh-tight);
  letter-spacing: var(--ls-display);
  color: var(--text-strong);
}
.gks-ai-hero__title span {
  background: linear-gradient(90deg, var(--brand-600), #7c3aed);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.gks-ai-hero__lede {
  max-width: 56ch;
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
  color: var(--text-muted);
}

.gks-ai-hero__card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760px;
  margin-top: var(--sp-2);
  overflow: hidden;
  border: 1.5px solid var(--brand-200);
  border-radius: var(--radius-4);
  background: var(--surface-card);
  box-shadow: 0 12px 40px rgba(37, 99, 235, .12), 0 2px 6px rgba(15, 44, 87, .06);
  text-align: left;
  transition: box-shadow .2s ease, border-color .2s ease;
}
.gks-ai-hero__card:focus-within { border-color: var(--brand-400); box-shadow: 0 14px 44px rgba(37, 99, 235, .18); }

/* The idle box is one generous field; the composer's own border goes. */
.gks-ai-hero__composer { border-top: 0; padding: var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4); }
.gks-ai-hero__composer :deep(.gks-chat-composer__field) {
  min-height: 52px;
  padding: var(--sp-3) 0;
  border: 0;
  background: transparent;
  font-size: 17px;
}
.gks-ai-hero__composer :deep(.gks-chat-composer__field:focus-visible) { outline: none; }
.gks-ai-hero__composer :deep(.gks-icon-btn) {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 0;
  background: var(--brand-600);
  color: var(--text-inverse);
}
.gks-ai-hero__composer :deep(.gks-icon-btn:disabled) { background: var(--brand-200); color: var(--text-inverse); }

.gks-ai-hero--active .gks-ai-hero__composer { border-top: var(--border-hair) solid var(--line-soft); }

.gks-ai-hero__bar {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-3) var(--sp-4);
  border-bottom: var(--border-hair) solid var(--line-soft);
  background: var(--surface-wash);
  font-size: var(--fs-body-sm);
  color: var(--text-strong);
}
.gks-ai-hero__bar-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-1);
  background: linear-gradient(135deg, var(--brand-500), #7c3aed);
  color: var(--text-inverse);
}
.gks-ai-hero__bar-spacer { flex: 1; }
.gks-ai-hero__bar-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 9px;
  border: 0;
  border-radius: var(--radius-1);
  background: none;
  color: var(--text-muted);
  font: inherit;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.gks-ai-hero__bar-btn:hover:not(:disabled) { background: var(--surface-card); color: var(--brand-600); }
.gks-ai-hero__bar-btn:disabled { opacity: .5; }

.gks-ai-hero__thread { height: min(520px, 62vh); flex: none; }

.gks-ai-hero__offline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: var(--sp-3) var(--sp-4);
  border-top: var(--border-hair) solid var(--line-soft);
  background: var(--surface-wash);
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-ai-hero__offline a { color: var(--brand-600); font-weight: var(--fw-semibold); }

.gks-ai-hero__starters {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-2);
  max-width: 760px;
}
.gks-ai-hero__starter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  color: var(--text-strong);
  font: inherit;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: border-color .15s ease, background .15s ease;
}
.gks-ai-hero__starter:hover { border-color: var(--brand-300); background: var(--brand-025); }
.gks-ai-hero__starter .gks-icon { color: var(--brand-600); }

.gks-ai-hero__trust {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--sp-2) var(--sp-5);
  margin-top: var(--sp-1);
}
.gks-ai-hero__trust li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-ai-hero__trust .gks-icon { color: var(--brand-500); }

@media (max-width: 640px) {
  .gks-ai-hero { padding: var(--sp-7) var(--sp-4) var(--sp-6); gap: var(--sp-3); }
  .gks-ai-hero__lede { font-size: var(--fs-body); }
  .gks-ai-hero__thread { height: min(460px, 60dvh); }
  /* The example questions run to two lines at this width; a field that shows
     both reads as an invitation, one that clips the second reads as broken. */
  .gks-ai-hero:not(.gks-ai-hero--active) .gks-ai-hero__composer :deep(.gks-chat-composer__field) { min-height: 76px; }
  .gks-ai-hero__starter { font-size: var(--fs-caption); padding: 7px 12px; }
  .gks-ai-hero__trust { gap: var(--sp-2) var(--sp-3); }
}
@media (prefers-reduced-motion: reduce) {
  .gks-ai-hero__card { transition: none; }
}
</style>
