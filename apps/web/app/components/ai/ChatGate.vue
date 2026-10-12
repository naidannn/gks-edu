<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * The sign-up card that takes the place of an answer past the guest allowance
 * (2C-15).
 *
 * A card in the thread rather than a modal: the visitor can still scroll up
 * and read the answers they already had, which is the argument for signing up.
 * It quotes the question back and says it will be answered — the question is
 * kept (`useAiChat.hold`) and sent the moment there is an account, so nothing
 * typed is lost and nobody has to ask twice.
 *
 * Google first, because it is one tap and no password; email next; signing in
 * last, for the people who already have an account. Each route comes back to
 * the page the visitor was on.
 */
defineProps<{ question: string | null; compact?: boolean }>();

const auth = useAuthStore();
const route = useRoute();

const googleEnabled = Boolean(useRuntimeConfig().public.googleClientId);
const error = ref<string | null>(null);
const pending = ref(false);

/**
 * Back to where they were — except the landing page, whose hero opens on a
 * fresh question box; the held question is answered on `/chat` instead, where
 * the thread it belongs to is on screen.
 */
const redirect = computed(() => (route.path === '/' ? '/chat' : route.fullPath));

async function google(idToken: string): Promise<void> {
  error.value = null;
  pending.value = true;
  try {
    // An unknown address creates the account, so this is sign-up and sign-in
    // both. The held question is sent by whoever is watching the auth state.
    await auth.loginWithGoogle(idToken, trackingPayload(newEventId()));
  } catch (err) {
    error.value = apiErrorMessage(err, 'Google-ээр нэвтэрч чадсангүй');
  } finally {
    pending.value = false;
  }
}

const PERKS = [
  { icon: 'infinity', text: 'Асуултын хязгааргүй' },
  { icon: 'history', text: 'Ярианы түүх хадгалагдана' },
  { icon: 'user-round-check', text: 'Зөвлөхтэй шууд холбогдоно' },
];
</script>

<template>
  <div class="gks-chat-gate" :class="{ 'gks-chat-gate--compact': compact }" role="group" aria-label="Бүртгүүлэх">
    <div class="gks-chat-gate__head">
      <span class="gks-chat-gate__mark" aria-hidden="true"><DsIcon name="sparkles" :size="18" /></span>
      <div>
        <strong class="gks-chat-gate__title">Хариултаа авахын тулд бүртгүүлээрэй</strong>
        <p class="gks-chat-gate__sub">Үнэгүй, 30 секунд. Асуулт тань хадгалагдсан — нэвтэрмэгц шууд хариулна.</p>
      </div>
    </div>

    <p v-if="question" class="gks-chat-gate__question">
      <DsIcon name="corner-down-right" :size="14" />
      <span>{{ question }}</span>
    </p>

    <ul class="gks-chat-gate__perks">
      <li v-for="perk in PERKS" :key="perk.text">
        <DsIcon :name="perk.icon" :size="14" />
        {{ perk.text }}
      </li>
    </ul>

    <div class="gks-chat-gate__actions">
      <div v-if="googleEnabled" class="gks-chat-gate__google" :aria-busy="pending">
        <AuthGoogleButton text="continue_with" @credential="google" />
      </div>
      <DsButton
        variant="accent"
        icon-left="mail"
        :block="true"
        @click="navigateTo({ path: '/register', query: { redirect } })"
      >
        Имэйлээр бүртгүүлэх
      </DsButton>
      <p class="gks-chat-gate__login">
        Бүртгэлтэй юу?
        <NuxtLink :to="{ path: '/login', query: { redirect } }">Нэвтрэх</NuxtLink>
      </p>
    </div>

    <p v-if="error" class="gks-chat-gate__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.gks-chat-gate {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  width: 100%;
  max-width: 440px;
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-3);
  background:
    radial-gradient(120% 80% at 0% 0%, var(--brand-050) 0%, transparent 60%),
    var(--surface-card);
  box-shadow: 0 8px 24px rgba(15, 44, 87, .08);
}
.gks-chat-gate--compact { padding: var(--sp-3); }

.gks-chat-gate__head { display: flex; gap: var(--sp-3); align-items: flex-start; }
.gks-chat-gate__mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: var(--radius-2);
  background: var(--brand-600);
  color: var(--text-inverse);
}
.gks-chat-gate__title { display: block; font-size: var(--fs-body); color: var(--text-strong); line-height: var(--lh-tight); }
.gks-chat-gate__sub { margin-top: 4px; font-size: var(--fs-caption); color: var(--text-muted); line-height: var(--lh-body); }

.gks-chat-gate__question {
  display: flex;
  gap: 6px;
  align-items: flex-start;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-2);
  background: var(--surface-wash);
  font-size: var(--fs-caption);
  color: var(--text-strong);
  overflow-wrap: anywhere;
}
.gks-chat-gate__question .gks-icon { flex: none; margin-top: 2px; color: var(--brand-600); }

.gks-chat-gate__perks { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-3); }
.gks-chat-gate__perks li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}
.gks-chat-gate__perks .gks-icon { color: var(--success-fg); }

.gks-chat-gate__actions { display: flex; flex-direction: column; gap: var(--sp-2); align-items: stretch; }
.gks-chat-gate__google { display: flex; justify-content: center; min-height: 40px; }
.gks-chat-gate__google[aria-busy='true'] { opacity: .6; pointer-events: none; }
.gks-chat-gate__login { text-align: center; font-size: var(--fs-caption); color: var(--text-muted); }
.gks-chat-gate__login a { color: var(--brand-600); font-weight: var(--fw-semibold); }
.gks-chat-gate__error { font-size: var(--fs-caption); color: var(--danger-fg); }
</style>
