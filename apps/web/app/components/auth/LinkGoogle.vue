<script setup lang="ts">
/**
 * Attaching a Google account to a password login (1N-03).
 *
 * The order matters and is the whole point: Google may not be linked from the
 * login screen, because anybody holding a Google account with the same address
 * could claim the row. Here the caller has already proved the account is
 * theirs by being signed in to it, so the link is safe — "sign in with your
 * password once, then link" is exactly this card.
 *
 * Hidden once the account is linked, and hidden for an account with no
 * password: a Google-only login already signs in this way and has nothing to
 * link from. `/users/me` carries the two flags that answer both.
 */
const api = useApi();
const auth = useAuthStore();

/** Only a password account that has not linked yet has anything to do here. */
const offered = computed(() => auth.user?.hasPassword === true && auth.user?.hasGoogle !== true);

const pending = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

async function link(idToken: string) {
  pending.value = true;
  error.value = null;
  done.value = false;
  try {
    await api.post('/auth/google/link', { idToken });
    done.value = true;
  } catch (err) {
    error.value = apiErrorMessage(err, 'Google хаягийг холбож чадсангүй.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <DsCard v-if="offered" title="Google хаяг холбох">
    <p class="gks-link-google__lede">
      Холбосны дараа нууц үгээ бичихгүйгээр Google-ээрээ нэвтэрч болно. Нууц үг тань хэвээр
      үлдэнэ.
    </p>

    <div class="gks-link-google__button" :class="{ 'gks-link-google__button--busy': pending }">
      <AuthGoogleButton text="continue_with" @credential="link" />
    </div>

    <p v-if="error" class="gks-link-google__error">{{ error }}</p>
    <p v-else-if="done" class="gks-link-google__done">
      Google хаяг холбогдлоо. Дараагийн удаа Google-ээрээ нэвтэрч болно.
    </p>
  </DsCard>
</template>

<style scoped>
.gks-link-google__lede { max-width: 62ch; font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-link-google__button { margin-top: var(--sp-4); max-width: 420px; }
.gks-link-google__button--busy { opacity: 0.6; pointer-events: none; }
.gks-link-google__error { margin-top: var(--sp-3); color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-link-google__done { margin-top: var(--sp-3); color: var(--success-fg); font-size: var(--fs-body-sm); }
</style>
