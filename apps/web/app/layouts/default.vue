<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const route = useRoute();

/**
 * Public navigation. Every entry points at a route that exists today and
 * returns something — the planner is an anchor on the landing page. The
 * catalogue's `?gks=1` / `?languagePrep=1` filters are deliberately *not*
 * linked yet: those flags are still unpopulated in the university data
 * (facets report 0), so the filtered views would come back empty.
 */
const NAV = [
  { to: '/universities', label: 'Их сургуулиуд' },
  { to: '/gks-scholarship', label: 'GKS тэтгэлэг' },
  { to: '/#planner', label: 'Төлөвлөгч' },
  { to: '/blog', label: 'Мэдээ' },
  { to: '/faq', label: 'Түгээмэл асуулт' },
  { to: '/consultation', label: 'Зөвлөгөө' },
];

const FOOTER_PLATFORM = [
  { to: '/universities', label: 'Их сургуулиуд' },
  { to: '/#planner', label: 'Сурах замын төлөвлөгч' },
  { to: '/consultation', label: 'Зөвлөгөө авах' },
  { to: '/login', label: 'Нэвтрэх' },
];

const FOOTER_SERVICES = [
  { to: '/consultation?service=LANGUAGE_PREP', label: 'Хэлний бэлтгэл' },
  { to: '/consultation?service=BACHELOR', label: 'Бакалавр' },
  { to: '/consultation?service=MASTER', label: 'Магистр, доктор' },
  { to: '/gks-scholarship', label: 'GKS тэтгэлэг' },
];

const year = new Date().getFullYear();

/**
 * Query strings are part of the identity here (`/universities?gks=1` is a
 * different nav item from `/universities`), and NuxtLink's own active class
 * ignores them — so the highlight is decided by hand.
 */
function isActive(to: string): boolean {
  if (to.startsWith('/#')) return false;
  const current = route.path.replace(/\/$/, '') || '/';
  const [path = '/', query = ''] = to.split('?');
  if (current !== (path.replace(/\/$/, '') || '/')) return false;
  const params = new URLSearchParams(query);
  return [...params].every(([key, value]) => route.query[key] === value)
    && Object.keys(route.query).length === params.size;
}

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
          <img src="~/assets/img/gks-logo-mark.png" alt="GKS EDU GROUP" class="gks-appbar__logo">
        </NuxtLink>

        <div class="gks-appbar__links">
          <NuxtLink
            v-for="item in NAV"
            :key="item.to"
            :to="item.to"
            class="gks-appbar__link"
            :class="{ 'gks-appbar__link--active': isActive(item.to) }"
          >
            {{ item.label }}
          </NuxtLink>
          <template v-if="auth.isAuthenticated">
            <NuxtLink to="/documents" class="gks-appbar__link">Баримт</NuxtLink>
            <NuxtLink to="/search" class="gks-appbar__link">Хайлт</NuxtLink>
            <NuxtLink to="/account/saved" class="gks-appbar__link">Хадгалсан</NuxtLink>
          </template>
          <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-appbar__link">CRM</NuxtLink>
        </div>

        <div class="gks-appbar__actions">
          <template v-if="auth.isAuthenticated">
            <span class="gks-appbar__user gks-tnum">{{ auth.user?.email }}</span>
            <DsButton variant="secondary" size="sm" icon-left="log-out" @click="onLogout">Гарах</DsButton>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="gks-appbar__login">Нэвтрэх</NuxtLink>
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
        <div class="gks-footer__brand-col">
          <img src="~/assets/img/gks-logo-full-knockout.png" alt="GKS EDU GROUP" class="gks-footer__logo">
          <p class="gks-footer__tagline">
            Монгол оюутнуудад зориулсан Солонгост суралцах зуучлалын платформ.
            Зөвлөгөөнөөс виз хүртэлх бүх алхам нэг дор.
          </p>
        </div>

        <nav class="gks-footer__col" aria-label="Платформ">
          <h2 class="gks-footer__col-title">Платформ</h2>
          <NuxtLink v-for="item in FOOTER_PLATFORM" :key="item.to" :to="item.to" class="gks-footer__link">
            {{ item.label }}
          </NuxtLink>
        </nav>

        <nav class="gks-footer__col" aria-label="Үйлчилгээ">
          <h2 class="gks-footer__col-title">Үйлчилгээ</h2>
          <NuxtLink v-for="item in FOOTER_SERVICES" :key="item.to" :to="item.to" class="gks-footer__link">
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="gks-footer__col">
          <h2 class="gks-footer__col-title">Холбоо барих</h2>
          <p class="gks-footer__text">«Жи Кэй Эс Эдү Групп» ХХК</p>
          <p class="gks-footer__text">Eco International Tower, 17 давхар, 1707 тоот</p>
          <a href="tel:+97677109000" class="gks-footer__link gks-tnum">7710-9000</a>
          <DsButton
            variant="accent"
            size="sm"
            icon-right="arrow-right"
            class="gks-footer__cta"
            @click="navigateTo('/consultation')"
          >
            Зөвлөгөө авах
          </DsButton>
        </div>
      </div>

      <div class="gks-footer__bottom">
        <p class="gks-tnum">© {{ year }} GKS EDU GROUP. Бүх эрх хуулиар хамгаалагдсан.</p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.gks-shell { min-height: 100vh; display: flex; flex-direction: column; background: var(--surface-page); }

/* ---- App bar: white, sticky, hairline ---- */
.gks-appbar {
  position: sticky;
  top: 0;
  z-index: 40;
  background: rgba(255, 255, 255, .88);
  backdrop-filter: blur(12px);
  border-bottom: var(--border-hair) solid var(--line-soft);
}
.gks-appbar__nav {
  max-width: var(--container-page);
  margin: 0 auto;
  min-height: 68px;
  padding: var(--sp-3) var(--gutter-desktop);
  display: flex;
  align-items: center;
  gap: var(--sp-6);
}
.gks-appbar__brand { display: flex; align-items: center; text-decoration: none; flex: none; }
.gks-appbar__logo { height: 30px; width: auto; display: block; }

.gks-appbar__links { display: flex; align-items: center; gap: var(--sp-6); margin-inline: auto; }
.gks-appbar__link {
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: var(--transition-control);
}
.gks-appbar__link:hover,
.gks-appbar__link--active { color: var(--brand-600); }
.gks-appbar__link--active { font-weight: var(--fw-semibold); }

.gks-appbar__actions { display: flex; align-items: center; gap: var(--sp-3); flex: none; }
.gks-appbar__user { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-appbar__login {
  display: inline-flex;
  align-items: center;
  min-height: var(--control-sm);
  padding: 0 var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--n-000);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-body);
  text-decoration: none;
  box-shadow: var(--shadow-raised);
}
.gks-appbar__login:hover { border-color: var(--brand-300); color: var(--brand-700); }

.gks-main {
  flex: 1;
  width: 100%;
  max-width: var(--container-page);
  margin: 0 auto;
  padding: var(--sp-8) var(--gutter-desktop) var(--sp-11);
}

/* ---- Footer: dark navy, four columns ---- */
.gks-footer { background: var(--surface-footer); color: var(--n-300); }
.gks-footer__inner {
  max-width: var(--container-page);
  margin: 0 auto;
  padding: var(--sp-10) var(--gutter-desktop) var(--sp-8);
  display: grid;
  grid-template-columns: 1.6fr 1fr 1fr 1.2fr;
  gap: var(--sp-8);
}
.gks-footer__logo { height: 26px; width: auto; display: block; }
.gks-footer__tagline {
  margin-top: var(--sp-4);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--n-400);
  max-width: 42ch;
}

.gks-footer__col { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3); }
.gks-footer__col-title {
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--brand-300);
}
.gks-footer__text { font-size: var(--fs-body-sm); color: var(--n-400); }
.gks-footer__link {
  font-size: var(--fs-body-sm);
  color: var(--n-300);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-footer__link:hover { color: var(--n-000); }
.gks-footer__cta { margin-top: var(--sp-2); }

.gks-footer__bottom {
  border-top: var(--border-hair) solid rgba(255, 255, 255, .10);
}
.gks-footer__bottom p {
  max-width: var(--container-page);
  margin: 0 auto;
  padding: var(--sp-5) var(--gutter-desktop);
  font-size: var(--fs-caption);
  color: var(--n-500);
}

@media (max-width: 1024px) {
  .gks-appbar__nav { flex-wrap: wrap; gap: var(--sp-3) var(--sp-5); }
  .gks-appbar__links { order: 3; width: 100%; margin-inline: 0; overflow-x: auto; padding-bottom: 2px; }
  .gks-appbar__actions { margin-inline-start: auto; }
  .gks-footer__inner { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .gks-appbar__nav { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-main { padding: var(--sp-6) var(--gutter-mobile) var(--sp-9); }
  .gks-footer__inner { grid-template-columns: 1fr; padding: var(--sp-8) var(--gutter-mobile) var(--sp-6); }
  .gks-footer__bottom p { padding: var(--sp-4) var(--gutter-mobile); }
  .gks-appbar__user { display: none; }
}
</style>
