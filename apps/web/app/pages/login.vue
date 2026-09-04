<script setup lang="ts">
import { loginSchema } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

useHead({ title: 'Нэвтрэх' });

const auth = useAuthStore();
const route = useRoute();

const email = ref('admin@gks.edu');
const password = ref('password123');
const mode = ref<'login' | 'register'>('login');
const name = ref('');
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;

  const parsed = loginSchema.safeParse({ email: email.value, password: password.value });
  if (!parsed.success) {
    error.value = parsed.error.issues.map((issue) => issue.message).join(', ');
    return;
  }

  pending.value = true;
  try {
    if (mode.value === 'login') {
      await auth.login(parsed.data.email, parsed.data.password);
    } else {
      await auth.register(parsed.data.email, parsed.data.password, name.value || undefined);
    }
    // An explicit redirect (staff bounced off a guarded /admin/* page) wins;
    // otherwise staff land on the CRM dashboard, everyone else on /documents.
    await navigateTo((route.query.redirect as string) || (auth.isStaff ? '/admin' : '/documents'));
  } catch (err) {
    const data = (err as { data?: { message?: string | string[] } }).data;
    error.value = Array.isArray(data?.message)
      ? data.message.join(', ')
      : (data?.message ?? 'Нэвтрэхэд алдаа гарлаа');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="gks-auth">
    <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-auth__mark">
    <h1 class="gks-auth__title">{{ mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх' }}</h1>

    <form class="gks-auth__form" @submit.prevent="submit">
      <DsInput v-if="mode === 'register'" v-model="name" label="Нэр" autocomplete="name" />
      <DsInput v-model="email" type="email" label="И-мэйл" required autocomplete="email" />
      <DsInput
        v-model="password"
        type="password"
        label="Нууц үг"
        required
        :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
      />

      <p v-if="error" class="gks-auth__error">{{ error }}</p>

      <DsButton type="submit" block :disabled="pending" :loading="pending">
        {{ pending ? 'Түр хүлээнэ үү…' : mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх' }}
      </DsButton>
    </form>

    <button type="button" class="gks-auth__switch" @click="mode = mode === 'login' ? 'register' : 'login'">
      {{ mode === 'login' ? 'Шинэ бүртгэл үүсгэх' : 'Аль хэдийн бүртгэлтэй юу?' }}
    </button>
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

.gks-auth__switch {
  margin-top: var(--sp-4);
  background: none;
  border: 0;
  padding: 0;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
</style>
