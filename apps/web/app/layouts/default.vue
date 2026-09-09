<script setup lang="ts">
import type { BannerItem } from '@gks/shared';
import logoFull from '~/assets/img/gks-logo-full.png';
import logoMark from '~/assets/img/gks-logo-mark.png';
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

/**
 * The scholarship is two pages now, and the check is the one people are sent a
 * link to — so it is a group rather than a sixth top-level entry, which is the
 * ceiling this bar works to.
 */
const SCHOLARSHIP: NavLink[] = [
  { to: '/gks-scholarship', label: 'Тэтгэлгийн тухай' },
  { to: '/gks-check', label: 'Боломжоо шалгах' },
];

const NAV: NavItem[] = [
  { to: '/plan', label: 'Төлөвлөгөө' },
  { to: '/universities', label: 'Их сургуулиуд' },
  { to: '/admissions', label: 'Элсэлт' },
  { label: 'Үйлчилгээ', children: SERVICES },
  { label: 'Засгийн газрын тэтгэлэг', children: SCHOLARSHIP },
];

/**
 * The ≤900px bottom tab bar. Most of our traffic is a phone, and a burger
 * costs one tap before anyone sees where they can go — so the four pages
 * people actually come for sit on the bottom edge, within thumb reach, and
 * the fifth tab opens the rest of `NAV` as a sheet above it.
 *
 * `label` is tab wording, not appbar wording: a fifth-of-a-screen tab cannot
 * carry "Их сургуулиуд". Five is the ceiling, the same one the portal shell
 * works to — a sixth entry goes into the sheet, never into this bar.
 *
 * `match` is the section prefix, so /universities/seoul-national keeps the
 * "Сургууль" tab lit; `isActive` above is exact by design (it has query
 * strings to weigh) and is the wrong test here.
 */
const TABS = [
  { to: '/', label: 'Нүүр', icon: 'house', match: null },
  { to: '/universities', label: 'Сургууль', icon: 'graduation-cap', match: '/universities' },
  { to: '/admissions', label: 'Элсэлт', icon: 'calendar-days', match: '/admissions' },
  { to: '/plan', label: 'Төлөвлөгөө', icon: 'route', match: '/plan' },
];

/**
 * The rest of the site, for the sheet only. These pages have always lived in
 * the footer, which is fine on a desktop and useless on a phone — the footer
 * is a scroll away, the sheet is one tap. The appbar itself stays at five
 * entries; this list never reaches it.
 */
const MORE: NavLink[] = [
  { to: '/blog', label: 'Мэдээ' },
  { to: '/faq', label: 'Түгээмэл асуулт' },
  { to: '/about', label: 'Бидний тухай' },
  { to: '/contact', label: 'Холбоо барих' },
];

/**
 * A NAV entry the tab bar already carries. The sheet still renders it — the
 * 901–1024px burger has no tab bar behind it and needs the full list — but
 * CSS drops the row below 900px, so the sheet is the overflow it claims to
 * be instead of a list with three rows the thumb is already resting on.
 */
function isTabbed(to: string): boolean {
  return TABS.some((tab) => tab.to === to);
}

/** The appbar's "Үйлчилгээ" group, plus the scholarship page it sits beside. */
const FOOTER_SERVICES = [
  { to: '/services/language-prep', label: 'Хэлний бэлтгэл' },
  { to: '/services/bachelor', label: 'Бакалавр' },
  { to: '/services/graduate', label: 'Магистр, доктор' },
  { to: '/gks-scholarship', label: 'Засгийн газрын тэтгэлэг' },
  { to: '/gks-check', label: 'Тэтгэлгийн боломжоо шалгах' },
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
  { to: '/about', label: 'Бидний тухай' },
  { to: '/contact', label: 'Холбоо барих' },
];

/**
 * The legal set (1A-33). It sits in the bottom bar rather than in a column of
 * its own: these are pages people look for when they already have a reason to,
 * and the copyright line is where every site trains them to look.
 */
const FOOTER_LEGAL = [
  { to: '/terms', label: 'Үйлчилгээний нөхцөл' },
  { to: '/privacy', label: 'Нууцлал' },
  { to: '/refund', label: 'Төлбөр, буцаалт' },
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

/** Section match for the bottom tabs — a detail page keeps its tab lit. */
function isTabActive(tab: { to: string; match: string | null }): boolean {
  if (!tab.match) return route.path === '/';
  return route.path === tab.match || route.path.startsWith(`${tab.match}/`);
}

/**
 * Two disclosures share one piece of state discipline: the desktop dropdown
 * and the ≤1024px panel both close on any navigation, on Escape, and on a
 * pointer landing outside the bar, the panel and the tab bar.
 */
const openGroup = ref<string | null>(null);
const menuOpen = ref(false);

function closeMenus() {
  openGroup.value = null;
  menuOpen.value = false;
}

watch(() => route.fullPath, closeMenus);

/**
 * One outside-tap rule for both disclosures. The panel used to sit in the
 * header's flow, so only the dropdown needed this; now that it is a fixed
 * overlay (and, on a phone, a sheet), a tap on the page behind has to dismiss
 * it too. The tab bar is excluded on purpose — its "Цэс" button toggles, and
 * closing here first would make the second tap reopen what it just shut.
 */
function onPointerDown(event: PointerEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('.gks-appbar, .gks-appbar__panel, .gks-tabbar')) return;
  closeMenus();
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

    <header class="gks-appbar">
      <nav class="gks-appbar__nav">
        <NuxtLink to="/" class="gks-appbar__brand">
          <!--
            The full lockup is 200px wide against the mark's 74, so it only goes
            in where the bar can spare the width: the burger band, where the
            links have collapsed, and the full 1180px bar. In between (1025-1180)
            the links are back but the bar is not yet wide enough — that band
            already ran within ~27px of overflowing — and below 640px the phone
            bar has no room either, so both fall back to the mark. `<picture>`
            fetches only the source that matches.
          -->
          <picture>
            <source
              :srcset="logoFull"
              media="(min-width: 641px) and (max-width: 1024px), (min-width: 1181px)"
              width="200"
              height="40"
            >
            <img
              :src="logoMark"
              alt="GKS EDU GROUP"
              class="gks-appbar__logo"
              width="74"
              height="32"
              decoding="async"
            >
          </picture>
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
          <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-appbar__link">CRM</NuxtLink>
        </div>

        <div class="gks-appbar__actions">
          <template v-if="auth.isAuthenticated">
            <span class="gks-appbar__user gks-tnum">{{ auth.user?.email }}</span>
            <NuxtLink to="/app" class="gks-appbar__account">
              <DsIcon name="folder-open" :size="16" />
              <span>Миний булан</span>
            </NuxtLink>
            <DsButton
              variant="secondary"
              size="sm"
              icon-left="log-out"
              class="gks-appbar__logout"
              @click="onLogout"
            >
              Гарах
            </DsButton>
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
    </header>

    <!-- The overflow of NAV, opened by the burger (tablet) or the "Цэс" tab
         (phone). It is `position: fixed` in both, because the appbar's
         backdrop-filter would otherwise become its containing block. -->
    <div v-show="menuOpen" class="gks-appbar__scrim" @click="closeMenus" />
    <div v-show="menuOpen" class="gks-appbar__panel">
      <span class="gks-appbar__handle" aria-hidden="true" />
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
        <NuxtLink
          v-else
          :to="item.to"
          class="gks-appbar__panel-link"
          :class="{ 'gks-appbar__panel-link--tabbed': isTabbed(item.to) }"
          @click="closeMenus"
        >
          {{ item.label }}
        </NuxtLink>
      </template>
      <NuxtLink
        v-for="item in MORE"
        :key="item.to"
        :to="item.to"
        class="gks-appbar__panel-link"
        @click="closeMenus"
      >
        {{ item.label }}
      </NuxtLink>
      <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-appbar__panel-link" @click="closeMenus">
        CRM
      </NuxtLink>
      <button v-if="auth.isAuthenticated" type="button" class="gks-appbar__panel-link gks-appbar__panel-logout" @click="onLogout">
        Гарах
      </button>
    </div>

    <main class="gks-main">
      <slot />
    </main>

    <footer class="gks-footer">
      <div class="gks-footer__inner">
        <div class="gks-footer__brand-col">
          <img
            src="~/assets/img/gks-logo-full-knockout.png"
            alt="GKS EDU GROUP"
            class="gks-footer__logo"
            width="130"
            height="26"
            loading="lazy"
            decoding="async"
          >
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
          <nav class="gks-footer__bottom-links" aria-label="Хууль зүйн мэдээлэл">
            <NuxtLink
              v-for="item in FOOTER_LEGAL"
              :key="item.to"
              :to="item.to"
              class="gks-footer__bottom-link"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>
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

    <nav class="gks-tabbar" aria-label="Үндсэн цэс">
      <NuxtLink
        v-for="tab in TABS"
        :key="tab.to"
        :to="tab.to"
        class="gks-tabbar__tab"
        :class="{ 'gks-tabbar__tab--active': isTabActive(tab) }"
        :aria-current="isTabActive(tab) ? 'page' : undefined"
      >
        <span class="gks-tabbar__icon"><DsIcon :name="tab.icon" :size="21" /></span>
        <span class="gks-tabbar__label">{{ tab.label }}</span>
      </NuxtLink>
      <button
        type="button"
        class="gks-tabbar__tab"
        :class="{ 'gks-tabbar__tab--active': menuOpen }"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <span class="gks-tabbar__icon"><DsIcon :name="menuOpen ? 'x' : 'menu'" :size="21" /></span>
        <span class="gks-tabbar__label">Цэс</span>
      </button>
    </nav>
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
.gks-appbar__logo { height: 32px; width: auto; display: block; }
/* Kept in step with the <picture> media above: the lockup's height, the mark's
   below it. */
@media (min-width: 641px) and (max-width: 1024px), (min-width: 1181px) {
  .gks-appbar__logo { height: 40px; }
}

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
.gks-appbar__scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 44;
  background: rgba(15, 44, 87, .38);
  /* Swallows the touch instead of letting it scroll the page underneath —
     cheaper and less fragile than locking the body from JS. */
  touch-action: none;
  overscroll-behavior: contain;
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
.gks-appbar__handle { display: none; }

.gks-appbar__actions { display: flex; align-items: center; gap: var(--sp-3); flex: none; }
.gks-appbar__user { font-size: var(--fs-caption); color: var(--text-subtle); }
/* The lockup claims 200px of the 1180px bar, and a signed-in staff account
   adds "Миний булан", "CRM" and this address chip on top of the five public
   links. The chip is the only one of them that says nothing "Гарах" does not
   already imply, so it is the first to go whenever the bar is not at its
   widest. */
@media (max-width: 1440px) {
  .gks-appbar__user { display: none; }
}
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

/* Signed in, the bar's job is to point at the cabinet, and a sixth muted link
   did not do it — people could not tell where their own pages were. This is
   the same accent shape "Бүртгүүлэх" has for everybody else, in the same
   place, so the bar always has exactly one bright thing in it. */
.gks-appbar__account {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--control-sm);
  padding: 0 var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--brand-600);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-inverse);
  text-decoration: none;
  white-space: nowrap;
  transition: var(--transition-control);
}
.gks-appbar__account:hover { background: var(--brand-700); color: var(--text-inverse); }
/* Only where the bar had to drop its own "Гарах" — above 640px it is still up
   there, and two of them in one open sheet is one too many. */
.gks-appbar__panel-logout {
  display: none;
  width: 100%;
  border-inline: 0;
  border-top: 0;
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

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

/* ---- Mobile bottom tabs (≤900px) ----
   Four destinations plus the sheet. Same shape as the portal shell's bar, so
   a client crossing between /universities and /app does not relearn the
   bottom edge of the screen. */
.gks-tabbar {
  display: none;
  position: fixed;
  inset: auto 0 0 0;
  z-index: 46;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: rgba(255, 255, 255, .94);
  backdrop-filter: blur(12px);
  border-top: var(--border-hair) solid var(--line-hairline);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.gks-tabbar__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 58px;
  padding: var(--sp-2) 2px;
  border: 0;
  background: none;
  font-family: inherit;
  color: var(--text-muted);
  text-decoration: none;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-tabbar__icon {
  display: inline-flex;
  padding: 2px var(--sp-4);
  border-radius: var(--radius-pill);
  transition: var(--transition-control);
}
.gks-tabbar__label {
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  line-height: 1;
}
.gks-tabbar__tab--active { color: var(--brand-700); }
.gks-tabbar__tab--active .gks-tabbar__icon { background: var(--surface-selected); }
.gks-tabbar__tab--active .gks-tabbar__label { font-weight: var(--fw-semibold); }

@media (max-width: 1024px) {
  .gks-appbar__nav { gap: var(--sp-4); }
  .gks-appbar__links { display: none; }
  .gks-appbar__actions { margin-inline-start: auto; }
  .gks-appbar__burger { display: inline-flex; }
  .gks-appbar__panel {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: 68px 0 auto 0;
    z-index: 45;
    max-width: var(--container-page);
    max-height: calc(100dvh - 68px);
    overflow-y: auto;
    margin: 0 auto;
    padding: 0 var(--gutter-desktop) var(--sp-4);
    background: var(--surface-raised);
    border-top: var(--border-hair) solid var(--line-soft);
    box-shadow: var(--shadow-menu);
  }
  .gks-footer__inner { grid-template-columns: 1fr 1fr; }
}

/* Below 900px the burger gives way to the tab bar, and the same NAV overflow
   opens upward as a sheet: the thumb is at the bottom of the phone, so the
   panel it summons should be too. */
@media (max-width: 900px) {
  .gks-appbar__burger { display: none; }
  .gks-tabbar { display: grid; }
  .gks-appbar__scrim { display: block; }

  .gks-appbar__panel {
    inset: auto 0 calc(58px + env(safe-area-inset-bottom, 0px)) 0;
    max-height: 60dvh;
    padding: var(--sp-2) var(--gutter-mobile) var(--sp-3);
    border-top: 0;
    border-radius: var(--radius-3) var(--radius-3) 0 0;
    box-shadow: 0 -12px 32px rgba(15, 44, 87, .18);
  }
  .gks-appbar__panel-link--tabbed { display: none; }
  .gks-appbar__handle {
    display: block;
    flex: none;
    align-self: center;
    width: 36px;
    height: 4px;
    margin: var(--sp-2) 0 var(--sp-1);
    border-radius: var(--radius-pill);
    background: var(--line-hairline);
  }
  /* The first panel title would otherwise sit hard against the handle. */
  .gks-appbar__panel-title:first-of-type { margin-top: var(--sp-1); }

  /* Clear the fixed bar so the last row of the footer is never trapped
     under it. */
  .gks-footer__bottom-inner { padding-bottom: calc(var(--sp-5) + 58px + env(safe-area-inset-bottom, 0px)); }
}

@media (max-width: 640px) {
  .gks-appbar__nav { padding: var(--sp-3) var(--gutter-mobile); }
  .gks-appbar__logout { display: none; }
  .gks-appbar__panel-logout { display: block; }
  .gks-main { padding: var(--sp-6) var(--gutter-mobile) var(--sp-9); }
  .gks-footer__inner { grid-template-columns: 1fr; padding: var(--sp-8) var(--gutter-mobile) var(--sp-6); }
  .gks-footer__bottom-inner {
    padding: var(--sp-4) var(--gutter-mobile) calc(var(--sp-4) + 58px + env(safe-area-inset-bottom, 0px));
  }
}
</style>
