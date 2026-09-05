<script setup lang="ts">
/**
 * The screen at the end of an emailed link: take the token out of the query,
 * take a new password, post both.
 *
 * Two flows land here — the invitation to claim a staff-created account
 * (1B-17) and a password reset — and they differ only in wording and in which
 * endpoint consumes the token, so the form itself lives in one place.
 */
const props = defineProps<{
  title: string;
  lede: string;
  /** API path that takes `{ token, password }`. */
  endpoint: string;
  submitLabel: string;
  successTitle: string;
  successText: string;
  /** Shown when the link carries no token at all. */
  missingTokenText: string;
}>();

const api = useApi();
const route = useRoute();

const token = computed(() => (route.query.token as string | undefined)?.trim() ?? '');

const password = ref('');
const passwordRepeat = ref('');
const done = ref(false);
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;

  if (password.value.length < 8) {
    error.value = 'Нууц үг дор хаяж 8 тэмдэгт байна.';
    return;
  }
  if (password.value !== passwordRepeat.value) {
    error.value = 'Нууц үг хоорондоо таарахгүй байна.';
    return;
  }

  pending.value = true;
  try {
    await api.post(props.endpoint, { token: token.value, password: password.value });
    done.value = true;
  } catch (err) {
    error.value = apiErrorMessage(err, 'Хадгалахад алдаа гарлаа. Дараа дахин оролдоно уу.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="gks-auth">
    <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-auth__mark">

    <template v-if="done">
      <h1 class="gks-auth__title">{{ successTitle }}</h1>
      <p class="gks-auth__lede">{{ successText }}</p>
      <div class="gks-auth__form">
        <DsButton variant="accent" block @click="navigateTo('/login')">Нэвтрэх</DsButton>
      </div>
    </template>

    <template v-else-if="!token">
      <h1 class="gks-auth__title">Холбоос буруу байна</h1>
      <p class="gks-auth__lede">{{ missingTokenText }}</p>
      <p class="gks-auth__switch">
        <NuxtLink to="/forgot-password">Шинэ холбоос хүсэх</NuxtLink>
      </p>
    </template>

    <template v-else>
      <h1 class="gks-auth__title">{{ title }}</h1>
      <p class="gks-auth__lede">{{ lede }}</p>

      <form class="gks-auth__form" @submit.prevent="submit">
        <DsInput
          v-model="password"
          type="password"
          label="Шинэ нууц үг"
          required
          autocomplete="new-password"
          hint="Дор хаяж 8 тэмдэгт"
        />
        <DsInput
          v-model="passwordRepeat"
          type="password"
          label="Нууц үг давтах"
          required
          autocomplete="new-password"
        />

        <p v-if="error" class="gks-auth__error">{{ error }}</p>

        <DsButton type="submit" variant="accent" block :disabled="pending" :loading="pending">
          {{ pending ? 'Хадгалж байна…' : submitLabel }}
        </DsButton>
      </form>

      <p class="gks-auth__switch">
        <NuxtLink to="/login">Нэвтрэх хуудас руу буцах</NuxtLink>
      </p>
    </template>
  </section>
</template>

<style scoped>
.gks-auth {
  max-width: var(--container-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.gks-auth__mark { height: 40px; width: auto; margin-bottom: var(--sp-6); }
.gks-auth__title { font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-auth__lede {
  margin-top: var(--sp-2);
  max-width: 420px;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}

.gks-auth__form {
  margin-top: var(--sp-6);
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  text-align: left;
}

.gks-auth__error {
  border: var(--border-hair) solid var(--danger-line);
  background: var(--danger-bg);
  color: var(--danger-fg);
  border-radius: var(--radius-1);
  padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-body-sm);
}

.gks-auth__switch { margin-top: var(--sp-5); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-auth__switch a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }
</style>
