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
  <section class="gks-page">
    <div>
      <span class="gks-eyebrow">GKS EDU GROUP</span>
      <h1 class="gks-page__title">GKS Edu boilerplate</h1>
      <p class="gks-page__lede">
        Full-stack эхлэлийн төсөл. API нь <code class="gks-code">/api/v1</code> дор,
        Swagger нь <code class="gks-code">/api/docs</code> дор ажиллана.
      </p>
    </div>

    <ul class="gks-stack-grid">
      <li v-for="item in stack" :key="item.name">
        <DsCard :title="item.name">
          <p class="gks-stack-grid__detail">{{ item.detail }}</p>
        </DsCard>
      </li>
    </ul>

    <DsCard v-if="!auth.isAuthenticated" accent>
      <div class="gks-seed">
        <p class="gks-seed__text">
          Seed хэрэглэгч: <strong class="gks-tnum">admin@gks.edu</strong> /
          <strong class="gks-tnum">password123</strong>
        </p>
        <DsButton variant="primary" icon-right="arrow-right" @click="navigateTo('/login')">Нэвтрэх</DsButton>
      </div>
    </DsCard>
  </section>
</template>

<style scoped>
.gks-page { display: flex; flex-direction: column; gap: var(--sp-8); }
.gks-page__title {
  margin-top: var(--sp-2);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-page__lede { margin-top: var(--sp-3); color: var(--text-muted); max-width: var(--container-prose); }
.gks-code {
  border-radius: var(--radius-1);
  background: var(--n-100);
  padding: 2px var(--sp-1);
  font-family: var(--font-mono);
  font-size: .9em;
}

.gks-stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
}
.gks-stack-grid__detail { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-seed {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}
.gks-seed__text { font-size: var(--fs-body-sm); color: var(--text-body); }
</style>
