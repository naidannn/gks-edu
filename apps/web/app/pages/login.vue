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
    await navigateTo((route.query.redirect as string) || '/documents');
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
  <section class="mx-auto max-w-sm">
    <h1 class="text-2xl font-bold">
      {{ mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх' }}
    </h1>

    <form class="mt-6 space-y-4" @submit.prevent="submit">
      <div v-if="mode === 'register'">
        <label for="name" class="block text-sm font-medium">Нэр</label>
        <input
          id="name"
          v-model="name"
          type="text"
          autocomplete="name"
          class="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
      </div>

      <div>
        <label for="email" class="block text-sm font-medium">И-мэйл</label>
        <input
          id="email"
          v-model="email"
          type="email"
          required
          autocomplete="email"
          class="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
      </div>

      <div>
        <label for="password" class="block text-sm font-medium">Нууц үг</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
          class="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
      </div>

      <p v-if="error" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {{ error }}
      </p>

      <button
        type="submit"
        :disabled="pending"
        class="w-full rounded-md bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {{ pending ? 'Түр хүлээнэ үү…' : mode === 'login' ? 'Нэвтрэх' : 'Бүртгүүлэх' }}
      </button>
    </form>

    <button
      type="button"
      class="mt-4 text-sm text-neutral-500 underline"
      @click="mode = mode === 'login' ? 'register' : 'login'"
    >
      {{ mode === 'login' ? 'Шинэ бүртгэл үүсгэх' : 'Аль хэдийн бүртгэлтэй юу?' }}
    </button>
  </section>
</template>
