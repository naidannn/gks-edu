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
          <NuxtLink to="/universities" class="gks-appbar__link">Сургуулиуд</NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/documents" class="gks-appbar__link">Баримт</NuxtLink>
          <NuxtLink v-if="auth.isAuthenticated" to="/search" class="gks-appbar__link">Хайлт</NuxtLink>

          <template v-if="auth.isAuthenticated">
            <span class="gks-appbar__user gks-tnum">{{ auth.user?.email }}</span>
            <DsButton variant="inverse" size="sm" icon-left="log-out" @click="onLogout">Гарах</DsButton>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="gks-appbar__link">Нэвтрэх</NuxtLink>
            <DsButton variant="accent" size="sm" @click="navigateTo('/consultation')">Зөвлөгөө авах</DsButton>
          </template>
        </div>
      </nav>
    </header>

    <main class="gks-main">
      <slot />
    </main>

    <footer class="gks-footer">
      <div class="gks-footer__inner">
        <div>
          <p class="gks-footer__brand">«Жи Кэй Эс Эдү Групп» ХХК</p>
          <p class="gks-footer__text">
            Eco International Tower, 17 давхар, 1707 тоот · Утас
            <a href="tel:+97677109000" class="gks-footer__link gks-tnum">7710-9000</a>
          </p>
        </div>
        <nav class="gks-footer__nav" aria-label="Хөлийн цэс">
          <NuxtLink to="/universities" class="gks-footer__link">Сургуулиуд</NuxtLink>
          <NuxtLink to="/consultation" class="gks-footer__link">Зөвлөгөө авах</NuxtLink>
        </nav>
      </div>
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
  padding: var(--sp-6) var(--gutter-desktop);
}
.gks-footer__inner {
  max-width: var(--container-content);
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
}
.gks-footer__brand { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-body); }
.gks-footer__text { margin-top: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-footer__nav { display: flex; gap: var(--sp-5); }
.gks-footer__link { font-size: var(--fs-caption); color: var(--text-link); text-decoration: none; }
.gks-footer__link:hover { color: var(--text-link-hover); }
</style>
