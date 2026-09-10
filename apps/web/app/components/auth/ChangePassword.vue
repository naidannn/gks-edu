<script setup lang="ts">
import type { AuthSession } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Changing your own password from inside the app — the portal cabinet and the
 * CRM both mount this one card.
 *
 * The API revokes every refresh token when the password changes, so it hands
 * back a fresh session for the browser that made the change; that is what
 * `auth.apply` puts back in place. Anyone signed in elsewhere is logged out,
 * which is the point.
 *
 * Hidden entirely for an account that has no password — a Google-only login
 * has nothing to change, and the API refuses it (1N-43). `/users/me` says
 * which kind this is.
 */
const api = useApi();
const auth = useAuthStore();

/** Nothing to change when there is no password behind the account. */
const offered = computed(() => auth.user?.hasPassword !== false);

const current = ref('');
const next = ref('');
const repeat = ref('');
const pending = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

async function submit() {
  error.value = null;
  done.value = false;

  /*
   * The current password is not optional any more.
   *
   * This field used to invite an empty value — "Google-ээр нэвтэрдэг бол хоосон
   * үлдээнэ үү" — and the API accepted it, which meant a fifteen-minute access
   * token was enough to mint a permanent credential on an account that had no
   * password to prove. The API refuses that now (1N-43), so the form must not
   * ask for it: an account with no password sets one through the emailed
   * invitation or the reset link, and that is what the note below says.
   */
  if (!current.value) {
    error.value = 'Одоогийн нууц үгээ оруулна уу. Нууц үг тохоогоогүй бол доорх холбоосыг ашиглана уу.';
    return;
  }
  if (next.value.length < 8) {
    error.value = 'Шинэ нууц үг дор хаяж 8 тэмдэгт байна.';
    return;
  }
  if (next.value !== repeat.value) {
    error.value = 'Шинэ нууц үг хоорондоо таарахгүй байна.';
    return;
  }

  pending.value = true;
  try {
    const session = await api.post<AuthSession>('/auth/password/change', {
      currentPassword: current.value,
      newPassword: next.value,
    });
    auth.apply(session);
    current.value = '';
    next.value = '';
    repeat.value = '';
    done.value = true;
  } catch (err) {
    error.value = apiErrorMessage(err, 'Нууц үг солиход алдаа гарлаа.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <DsCard v-if="offered" title="Нууц үг солих">
    <form class="gks-pwd" @submit.prevent="submit">
      <DsInput
        v-model="current"
        type="password"
        label="Одоогийн нууц үг"
        required
        autocomplete="current-password"
      />
      <DsInput
        v-model="next"
        type="password"
        label="Шинэ нууц үг"
        required
        autocomplete="new-password"
        hint="Дор хаяж 8 тэмдэгт"
      />
      <DsInput
        v-model="repeat"
        type="password"
        label="Шинэ нууц үг давтах"
        required
        autocomplete="new-password"
      />

      <p v-if="error" class="gks-pwd__error">{{ error }}</p>
      <p v-else-if="done" class="gks-pwd__done">
        Нууц үг солигдлоо. Бусад төхөөрөмж дээр нэвтэрсэн сесс хаагдсан тул дахин нэвтэрнэ үү.
      </p>

      <footer class="gks-pwd__actions">
        <DsButton type="submit" variant="accent" icon-left="key-round" :loading="pending">
          Нууц үг солих
        </DsButton>
      </footer>

      <p class="gks-pwd__note">
        Google-ээр нэвтэрдэг эсвэл нууц үг хэзээ ч тохоогоогүй бол эндээс биш —
        <NuxtLink to="/forgot-password">«Нууц үгээ мартсан»</NuxtLink> холбоосоор эсвэл имэйлээр
        ирсэн урилгаараа тохируулна уу.
      </p>
    </form>
  </DsCard>
</template>

<style scoped>
.gks-pwd { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; }
.gks-pwd__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-pwd__done { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-pwd__actions { display: flex; justify-content: flex-start; }
.gks-pwd__note { font-size: var(--fs-caption); color: var(--text-muted); line-height: var(--lh-body); }
</style>
