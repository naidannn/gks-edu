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
 */
const api = useApi();
const auth = useAuthStore();

const current = ref('');
const next = ref('');
const repeat = ref('');
const pending = ref(false);
const error = ref<string | null>(null);
const done = ref(false);

async function submit() {
  error.value = null;
  done.value = false;

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
      currentPassword: current.value || undefined,
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
  <DsCard title="Нууц үг солих">
    <form class="gks-pwd" @submit.prevent="submit">
      <DsInput
        v-model="current"
        type="password"
        label="Одоогийн нууц үг"
        autocomplete="current-password"
        hint="Google-ээр нэвтэрдэг, нууц үг тохоогоогүй бол хоосон үлдээнэ үү"
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
    </form>
  </DsCard>
</template>

<style scoped>
.gks-pwd { display: flex; flex-direction: column; gap: var(--sp-4); max-width: 420px; }
.gks-pwd__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-pwd__done { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-pwd__actions { display: flex; justify-content: flex-start; }
</style>
