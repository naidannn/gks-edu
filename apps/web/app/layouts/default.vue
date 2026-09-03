<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();

async function onLogout() {
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <nav class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <NuxtLink to="/" class="text-lg font-semibold text-brand-700 dark:text-brand-300">
          GKS Edu
        </NuxtLink>

        <div class="flex items-center gap-4 text-sm">
          <NuxtLink to="/" class="hover:text-brand-600">Нүүр</NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/documents" class="hover:text-brand-600">
            Баримт
          </NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/search" class="hover:text-brand-600">
            Хайлт
          </NuxtLink>

          <template v-if="auth.isAuthenticated">
            <span class="text-neutral-500">{{ auth.user?.email }}</span>
            <button type="button" class="text-neutral-500 hover:text-red-600" @click="onLogout">
              Гарах
            </button>
          </template>
          <NuxtLink v-else to="/login" class="rounded-md bg-brand-600 px-3 py-1.5 text-white hover:bg-brand-700">
            Нэвтрэх
          </NuxtLink>
        </div>
      </nav>
    </header>

    <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <slot />
    </main>

    <footer class="border-t border-neutral-200 px-4 py-6 text-center text-xs text-neutral-500 dark:border-neutral-800">
      Nuxt 4 · NestJS · Prisma · PostgreSQL 17 + pgvector · Redis
    </footer>
  </div>
</template>
