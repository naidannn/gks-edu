<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

useHead({ title: 'Нүүр' });

const auth = useAuthStore();

const stack = [
  { name: 'Nuxt 4 + Vue 3', detail: 'TypeScript, Pinia, Tailwind CSS 4' },
  { name: 'NestJS 12', detail: 'JWT auth, Swagger, throttling, health checks' },
  { name: 'Prisma + PostgreSQL 17', detail: 'Migrations, seed, typed client' },
  { name: 'pgvector', detail: 'Cosine similarity search over document chunks' },
  { name: 'Redis', detail: 'cache-manager read-through cache + raw ioredis client' },
];
</script>

<template>
  <section class="space-y-8">
    <div>
      <h1 class="text-3xl font-bold tracking-tight">GKS Edu boilerplate</h1>
      <p class="mt-2 text-neutral-600 dark:text-neutral-400">
        Full-stack эхлэлийн төсөл. API нь
        <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">/api/v1</code> дор,
        Swagger нь
        <code class="rounded bg-neutral-200 px-1 dark:bg-neutral-800">/api/docs</code> дор ажиллана.
      </p>
    </div>

    <ul class="grid gap-3 sm:grid-cols-2">
      <li
        v-for="item in stack"
        :key="item.name"
        class="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <p class="font-medium">{{ item.name }}</p>
        <p class="mt-1 text-sm text-neutral-500">{{ item.detail }}</p>
      </li>
    </ul>

    <div v-if="!auth.isAuthenticated" class="rounded-lg bg-brand-50 p-4 text-sm dark:bg-brand-900/30">
      Seed хэрэглэгч: <strong>admin@gks.edu</strong> / <strong>password123</strong> —
      <NuxtLink to="/login" class="font-medium text-brand-700 underline dark:text-brand-300">
        нэвтрэх
      </NuxtLink>
    </div>
  </section>
</template>
