<script setup lang="ts">
import type { BannerItem } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

const auth = useAuthStore();
const route = useRoute();

/**
 * Public navigation. Nine flat links did not fit the 1180px bar; the bar now
 * carries three entries only — catalogue, services, GKS — and the three
 * service pages (1A-10) hang off "Үйлчилгээ" as a dropdown. Мэдээ, түгээмэл
 * асуулт, зөвлөгөө and the planner are reached from the footer and from the
 * landing page's own calls to action.
 *
 * Every entry points at a route that exists today and returns something. The
 * catalogue's `?gks=1` / `?languagePrep=1` filters are deliberately *not*
 * linked yet: those flags are still unpopulated in the university data
 * (facets report 0), so the filtered views would come back empty.
 */
type NavLink = { to: string; label: string };
type NavGroup = { label: string; children: NavLink[] };
type NavItem = NavLink | NavGroup;

const SERVICES: NavLink[] = [
  { to: '/services/language-prep', label: 'Хэлний бэлтгэл' },
  { to: '/services/bachelor', label: 'Бакалавр' },
  { to: '/services/graduate', label: 'Магистр, доктор' },
];

const NAV: NavItem[] = [
  { to: '/plan', label: 'Төлөвлөгөө' },
  { to: '/universities', label: 'Их сургуулиуд' },
  { to: '/admissions', label: 'Элсэлт' },
  { label: 'Үйлчилгээ', children: SERVICES },
  { to: '/gks-scholarship', label: 'Засгийн газрын тэтгэлэг' },
];

/** The appbar's "Үйлчилгээ" group, plus the scholarship page it sits beside. */
const FOOTER_SERVICES = [
  { to: '/services/language-prep', label: 'Хэлний бэлтгэл' },
  { to: '/services/bachelor', label: 'Бакалавр' },
  { to: '/services/graduate', label: 'Магистр, доктор' },
  { to: '/gks-scholarship', label: 'Засгийн газрын тэтгэлэг' },
];

/**
 * Everything the three-item appbar no longer carries. This column is now the
 * only site-wide route to the planner, the blog and the FAQ, so it has to stay
 * complete — check it whenever a public page is added.
 *
 * Зөвлөгөө is deliberately absent: it is the accent button below, and one
 * strong call to action beats a link that repeats it two rows up.
 */
const FOOTER_EXPLORE = [
  { to: '/universities', label: 'Их сургуулиуд' },
  { to: '/admissions', label: 'Элсэлтийн хуанли' },
  { to: '/plan', label: 'Суралцах төлөвлөгөө' },
  { to: '/blog', label: 'Мэдээ' },
  { to: '/faq', label: 'Түгээмэл асуулт' },
];

const year = new Date().getFullYear();

/**
 * 1G-14 — the dated promo strip. Fetched with the page so it is in the SSR
 * HTML; an empty list (the normal state) renders nothing at all.
 */
const { data: banners } = await useApiFetch<BannerItem[]>('/banners?placement=SITE_TOP');

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

function isGroupActive(group: NavGroup): boolean {
  return group.children.some((child) => isActive(child.to));
}

/**
 * Two disclosures share one piece of state discipline: the desktop dropdown
 * and the ≤1024px panel both close on any navigation, on Escape, and — for
 * the dropdown — on a pointer landing outside the bar.
 */
const openGroup = ref<string | null>(null);
const menuOpen = ref(false);
const appbar = ref<HTMLElement | null>(null);

function closeMenus() {
  openGroup.value = null;
  menuOpen.value = false;
}

watch(() => route.fullPath, closeMenus);

function onPointerDown(event: PointerEvent) {
  if (appbar.value && !appbar.value.contains(event.target as Node)) openGroup.value = null;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenus();
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown);
  document.removeEventListener('keydown', onKeydown);
});

async function onLogout() {
  closeMenus();
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="gks-shell">
    <aside v-if="banners?.length" class="gks-promo">
      <p v-for="banner in banners" :key="banner.id" class="gks-promo__row">
        <strong>{{ banner.titleMn }}</strong>
        <span v-if="banner.bodyMn">{{ banner.bodyMn }}</span>
        <NuxtLink v-if="banner.linkUrl" :to="banner.linkUrl" class="gks-promo__link">
          {{ banner.linkLabel || 'Дэлгэрэнгүй' }}
        </NuxtLink>
      </p>
    </aside>

    <header ref="appbar" class="gks-appbar">
      <nav class="gks-appbar__nav">
        <NuxtLink to="/" class="gks-appbar__brand">
          <img src="~/assets/img/gks-logo-mark.png" alt="GKS EDU GROUP" class="gks-appbar__logo">
        </NuxtLink>

        <div class="gks-appbar__links">
          <template v-for="item in NAV" :key="item.label">
            <div v-if="'children' in item" class="gks-appbar__group">
              <button
                type="button"
                class="gks-appbar__link gks-appbar__trigger"
                :class="{ 'gks-appbar__link--active': isGroupActive(item) }"
                :aria-expanded="openGroup === item.label"
                @click="openGroup = openGroup === item.label ? null : item.label"
              >
                {{ item.label }}
                <DsIcon name="chevron-down" :size="15" />
              </button>
              <div v-show="openGroup === item.label" class="gks-appbar__menu">
                <NuxtLink
                  v-for="child in item.children"
                  :key="child.to"
                  :to="child.to"
                  class="gks-appbar__menu-link"
                  :class="{ 'gks-appbar__menu-link--active': isActive(child.to) }"
                >
                  {{ child.label }}
                </NuxtLink>
              </div>
            </div>
            <NuxtLink
              v-else
              :to="item.to"
              class="gks-appbar__link"
              :class="{ 'gks-appbar__link--active': isActive(item.to) }"
            >
              {{ item.label }}
            </NuxtLink>
          </template>
          <NuxtLink v-if="auth.isAuthenticated" to="/app" class="gks-appbar__link">Миний булан</NuxtLink>
          <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-appbar__link">CRM</NuxtLink>
        </div>

        <div class="gks-appbar__actions">
          <template v-if="auth.isAuthenticated">
            <span class="gks-appbar__user gks-tnum">{{ auth.user?.email }}</span>
            <DsButton variant="secondary" size="sm" icon-left="log-out" @click="onLogout">Гарах</DsButton>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="gks-appbar__login">Нэвтрэх</NuxtLink>
            <DsButton variant="accent" size="sm" @click="navigateTo('/register')">Бүртгүүлэх</DsButton>
          </template>
          <button
            type="button"
            class="gks-appbar__burger"
            :aria-expanded="menuOpen"
            aria-label="Цэс"
            @click="menuOpen = !menuOpen"
          >
            <DsIcon :name="menuOpen ? 'x' : 'menu'" :size="22" />
          </button>
        </div>
      </nav>

      <div v-show="menuOpen" class="gks-appbar__panel">
        <template v-for="item in NAV" :key="item.label">
          <div v-if="'children' in item" class="gks-appbar__panel-group">
            <p class="gks-appbar__panel-title">{{ item.label }}</p>
            <NuxtLink
              v-for="child in item.children"
              :key="child.to"
              :to="child.to"
              class="gks-appbar__panel-link"
              @click="closeMenus"
            >
              {{ child.label }}
            </NuxtLink>
          </div>
          <NuxtLink v-else :to="item.to" class="gks-appbar__panel-link" @click="closeMenus">
            {{ item.label }}
          </NuxtLink>
        </template>
        <NuxtLink v-if="auth.isAuthenticated" to="/app" class="gks-appbar__panel-link" @click="closeMenus">
          Миний булан
        </NuxtLink>
        <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-appbar__panel-link" @click="closeMenus">
          CRM
        </NuxtLink>
      </div>
    </header>

    <main class="gks-main">
      <slot />
    </main>

    <footer class="gks-footer">
      <div class="gks-footer__inner">
        <div class="gks-footer__brand-col">
          <img src="~/assets/img/gks-logo-full-knockout.png" alt="GKS EDU GROUP" class="gks-footer__logo">
          <p class="gks-footer__tagline">{{ COMPANY.tagline }}</p>
        </div>

        <nav class="gks-footer__col" aria-label="Үйлчилгээ">
          <h2 class="gks-footer__col-title">Үйлчилгээ</h2>
          <NuxtLink v-for="item in FOOTER_SERVICES" :key="item.to" :to="item.to" class="gks-footer__link">
            {{ item.label }}
          </NuxtLink>
        </nav>

        <nav class="gks-footer__col" aria-label="Мэдээлэл">
          <h2 class="gks-footer__col-title">Мэдээлэл</h2>
          <NuxtLink v-for="item in FOOTER_EXPLORE" :key="item.to" :to="item.to" class="gks-footer__link">
            {{ item.label }}
          </NuxtLink>
        </nav>

        <div class="gks-footer__col">
          <h2 class="gks-footer__col-title">Холбоо барих</h2>
          <address class="gks-footer__address">
            <span class="gks-footer__text">{{ COMPANY.legalName }}</span>
            <span class="gks-footer__text">
              {{ COMPANY.city }}, {{ COMPANY.landmark }},<br>
              {{ COMPANY.street }}
            </span>
            <a :href="`tel:${COMPANY.phone}`" class="gks-footer__link gks-tnum">
              {{ COMPANY.phoneLabel }}
            </a>
          </address>
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
        <div class="gks-footer__bottom-inner">
          <p class="gks-tnum">© {{ year }} GKS EDU GROUP. Бүх эрх хуулиар хамгаалагдсан.</p>
          <nav class="gks-footer__bottom-links" aria-label="Хэрэглэгчийн хэсэг">
            <NuxtLink v-if="auth.isAuthenticated" to="/app" class="gks-footer__bottom-link">
              Миний булан
            </NuxtLink>
            <template v-else>
              <NuxtLink to="/login" class="gks-footer__bottom-link">Нэвтрэх</NuxtLink>
              <NuxtLink to="/register" class="gks-footer__bottom-link">Бүртгүүлэх</NuxtLink>
            </template>
          </nav>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.gks-promo {
  background: var(--brand-900, #0f2c57);
  color: #fff;
  font-size: var(--fs-micro);
}
.gks-promo__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  max-width: var(--container-content);
  margin: 0 auto;
  padding: var(--sp-2) var(--sp-4);
  text-align: center;
}
.gks-promo__link { color: #fff; text-decoration: underline; white-space: nowrap; }

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

/* ---- "Үйлчилгээ" dropdown ---- */
.gks-appbar__group { position: relative; display: flex; align-items: center; }
.gks-appbar__trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  border: 0;
  padding: 0;
  background: none;
  font-family: inherit;
  cursor: pointer;
}
.gks-appbar__trigger[aria-expanded="true"] { color: var(--brand-600); }
.gks-appbar__trigger[aria-expanded="true"] .gks-icon { transform: rotate(180deg); }
.gks-appbar__trigger .gks-icon { transition: var(--transition-control); }

.gks-appbar__menu {
  position: absolute;
  top: calc(100% + var(--sp-3));
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  padding: var(--sp-2);
  border-radius: var(--radius-2);
  background: var(--surface-raised);
  box-shadow: var(--shadow-menu);
}
.gks-appbar__menu-link {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-1);
  font-size: var(--fs-body-sm);
  color: var(--text-body);
  text-decoration: none;
  white-space: nowrap;
  transition: var(--transition-control);
}
.gks-appbar__menu-link:hover { background: var(--surface-hover); color: var(--brand-700); }
.gks-appbar__menu-link--active { color: var(--brand-600); font-weight: var(--fw-semibold); }

/* ---- ≤1024px panel ---- */
.gks-appbar__burger {
  display: none;
  align-items: center;
  justify-content: center;
  width: var(--control-sm);
  height: var(--control-sm);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--n-000);
  color: var(--text-body);
  cursor: pointer;
}
.gks-appbar__panel { display: none; }
.gks-appbar__panel-group { display: contents; }
.gks-appbar__panel-title {
  margin-top: var(--sp-3);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-appbar__panel-link {
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-soft);
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  color: var(--text-body);
  text-decoration: none;
}
.gks-appbar__panel-link:hover { color: var(--brand-600); }

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
.gks-footer__text { font-size: var(--fs-body-sm); line-height: var(--lh-body); color: var(--n-400); }
.gks-footer__address {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
  font-style: normal;
}
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
.gks-footer__bottom-inner {
  max-width: var(--container-page);
  margin: 0 auto;
  padding: var(--sp-5) var(--gutter-desktop);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-3) var(--sp-5);
  font-size: var(--fs-caption);
  color: var(--n-500);
}
.gks-footer__bottom-links { display: flex; gap: var(--sp-5); }
.gks-footer__bottom-link {
  font-size: var(--fs-caption);
  color: var(--n-400);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-footer__bottom-link:hover { color: var(--n-000); }

@media (max-width: 1024px) {
  .gks-appbar__nav { gap: var(--sp-4); }
  .gks-appbar__links { display: none; }
  .gks-appbar__actions { margin-inline-start: auto; }
  .gks-appbar__burger { display: inline-flex; }
  .gks-appbar__panel {
    display: flex;
    flex-direction: column;
    max-width: var(--container-page);
    max-height: calc(100vh - 68px);
    overflow-y: auto;
    margin: 0 auto;
    padding: 0 var(--gutter-desktop) var(--sp-4);
    border-top: var(--border-hair) solid var(--line-soft);
  }
  .gks-footer__inner { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .gks-appbar__nav { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-appbar__panel { padding: 0 var(--gutter-mobile) var(--sp-4); }
  .gks-main { padding: var(--sp-6) var(--gutter-mobile) var(--sp-9); }
  .gks-footer__inner { grid-template-columns: 1fr; padding: var(--sp-8) var(--gutter-mobile) var(--sp-6); }
  .gks-footer__bottom-inner { padding: var(--sp-4) var(--gutter-mobile); }
  .gks-appbar__user { display: none; }
}
</style>
