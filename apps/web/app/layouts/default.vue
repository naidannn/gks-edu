<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();

async function onLogout() {
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="gks-shell">
    <header class="gks-appbar">
      <nav class="gks-appbar__nav">
        <NuxtLink to="/" class="gks-appbar__brand">
          <img src="~/assets/img/gks-logo-full-knockout.png" alt="GKS EDU GROUP" class="gks-appbar__logo">
        </NuxtLink>

        <div class="gks-appbar__links">
          <NuxtLink to="/" class="gks-appbar__link">Нүүр</NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/documents" class="gks-appbar__link">Баримт</NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/search" class="gks-appbar__link">Хайлт</NuxtLink>

          <template v-if="auth.isAuthenticated">
            <span class="gks-appbar__user gks-tnum">{{ auth.user?.email }}</span>
            <DsButton variant="inverse" size="sm" icon-left="log-out" @click="onLogout">Гарах</DsButton>
          </template>
          <DsButton v-else variant="accent" size="sm" @click="navigateTo('/login')">Нэвтрэх</DsButton>
        </div>
      </nav>
    </header>

    <main class="gks-main">
      <slot />
    </main>

    <footer class="gks-footer">
      <p class="gks-footer__text">Nuxt 4 · NestJS · Prisma · PostgreSQL 17 + pgvector · Redis</p>
    </footer>
  </div>
</template>

<style scoped>
.gks-shell { min-height: 100vh; display: flex; flex-direction: column; }

.gks-appbar {
  background: var(--surface-inverse);
  border-bottom: var(--border-hair) solid var(--ink-700);
}
.gks-appbar__nav {
  max-width: var(--container-content);
  margin: 0 auto;
  min-height: var(--control-lg);
  padding: var(--sp-3) var(--gutter-desktop);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}
.gks-appbar__brand { display: flex; align-items: center; text-decoration: none; }
.gks-appbar__logo { height: 22px; width: auto; display: block; }

.gks-appbar__links { display: flex; align-items: center; gap: var(--sp-6); }
.gks-appbar__link {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-inverse);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-appbar__link:hover,
.gks-appbar__link.router-link-active { color: var(--red-300); }
.gks-appbar__user { font-size: var(--fs-caption); color: var(--n-400); }

.gks-main {
  flex: 1;
  width: 100%;
  max-width: var(--container-content);
  margin: 0 auto;
  padding: var(--sp-8) var(--gutter-desktop);
}

.gks-footer {
  border-top: var(--border-hair) solid var(--line-hairline);
  padding: var(--sp-5) var(--gutter-desktop);
  text-align: center;
}
.gks-footer__text { font-size: var(--fs-caption); color: var(--text-subtle); }
</style>
