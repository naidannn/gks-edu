<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * Client cabinet shell (1G-15). Every `/app/*` screen lives here: a fixed
 * sidebar with the things a client ever needs, and nothing from the marketing
 * site or the CRM.
 *
 * ≤900px the same entries become a bottom tab bar instead of a drawer, which
 * costs no tap to open. `short` is the tab-bar wording: the sidebar can afford
 * "Хяналтын самбар", a 20%-wide tab cannot. Five is the ceiling — the chat
 * (1J) took the last slot, and anything after it goes inside a screen rather
 * than into this bar.
 */
const auth = useAuthStore();
const route = useRoute();
const { overview, load, needsProfile } = usePortal();
const messenger = useMessengerStream();

onMounted(() => {
  load();
  // The badge has to be right on every screen, not only on /messages, so the
  // live connection belongs to the shell.
  messenger.connect();
  messenger.refreshUnread();
});
onBeforeUnmount(() => messenger.disconnect());

const NAV = [
  { to: '/app', label: 'Хяналтын самбар', short: 'Самбар', icon: 'layout-dashboard' },
  { to: '/messages', label: 'Зөвлөхтэй чатлах', short: 'Чат', icon: 'message-circle' },
  { to: '/app/cases', label: 'Миний үйлчилгээ', short: 'Үйлчилгээ', icon: 'folder-open' },
  { to: '/app/profile', label: 'Миний мэдээлэл', short: 'Мэдээлэл', icon: 'user-round' },
  { to: '/account/saved', label: 'Хадгалсан сургууль', short: 'Хадгалсан', icon: 'bookmark' },
];

/** The chat is the only entry that carries a count; the rest carry a dot or nothing. */
const unreadFor = (to: string): number => (to === '/messages' ? messenger.unread.value.threads : 0);

function isActive(to: string): boolean {
  if (to === '/app') return route.path === '/app';
  return route.path === to || route.path.startsWith(`${to}/`);
}

const currentSection = computed(() => NAV.find((item) => isActive(item.to))?.label ?? 'Миний булан');
const displayName = computed(() => overview.value?.profile.fullName ?? auth.user?.name ?? auth.user?.email ?? '');

async function onLogout() {
  overview.value = null;
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="gks-portal">
    <aside class="gks-portal__sidebar">
      <div class="gks-portal__brand">
        <NuxtLink to="/app" class="gks-portal__brand-link">
          <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-portal__logo">
          <span class="gks-portal__brand-text">Миний булан</span>
        </NuxtLink>
      </div>

      <nav class="gks-portal__nav" aria-label="Хэрэглэгчийн цэс">
        <NuxtLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          class="gks-portal__nav-link"
          :class="{ 'gks-portal__nav-link--active': isActive(item.to) }"
        >
          <DsIcon :name="item.icon" :size="18" />
          <span>{{ item.label }}</span>
          <span v-if="unreadFor(item.to)" class="gks-portal__count gks-tnum" :aria-label="`${unreadFor(item.to)} шинэ мессеж`">
            {{ unreadFor(item.to) }}
          </span>
          <span v-else-if="item.to === '/app/profile' && needsProfile" class="gks-portal__dot" aria-label="Дутуу мэдээлэл" />
        </NuxtLink>
      </nav>

      <div class="gks-portal__sidebar-foot">
        <DsButton variant="accent" size="sm" block icon-left="plus" @click="navigateTo('/app/start')">
          Шинэ үйлчилгээ эхлүүлэх
        </DsButton>

        <NuxtLink to="/" class="gks-portal__site-link">
          <DsIcon name="arrow-left" :size="16" />
          <span>Вебсайт руу буцах</span>
        </NuxtLink>

        <div class="gks-portal__user">
          <div class="gks-portal__user-avatar" aria-hidden="true">
            {{ (displayName || '?').slice(0, 1).toUpperCase() }}
          </div>
          <div class="gks-portal__user-info">
            <p class="gks-portal__user-name">{{ displayName }}</p>
            <p class="gks-portal__user-role gks-tnum">{{ overview?.profile.code ?? 'Шинэ бүртгэл' }}</p>
          </div>
          <button type="button" class="gks-portal__icon-btn" aria-label="Гарах" title="Гарах" @click="onLogout">
            <DsIcon name="log-out" :size="18" />
          </button>
        </div>
      </div>
    </aside>

    <div class="gks-portal__body">
      <header class="gks-portal__topbar">
        <!-- ≤900px the sidebar is gone, so its two non-navigation affordances
             (back to the site, sign out) move up here beside the bell. -->
        <NuxtLink to="/" class="gks-portal__icon-btn gks-portal__mobile-only" aria-label="Вебсайт руу буцах" title="Вебсайт руу буцах">
          <DsIcon name="arrow-left" :size="20" />
        </NuxtLink>
        <span class="gks-portal__topbar-title">{{ currentSection }}</span>
        <ClientOnly>
          <NotificationsBell class="gks-portal__bell" />
        </ClientOnly>
        <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-portal__crm-link">CRM</NuxtLink>
        <button
          type="button"
          class="gks-portal__icon-btn gks-portal__mobile-only"
          aria-label="Гарах"
          title="Гарах"
          @click="onLogout"
        >
          <DsIcon name="log-out" :size="20" />
        </button>
      </header>

      <main class="gks-portal__main" :class="{ 'gks-portal__main--flush': route.meta.flush }">
        <slot />
      </main>
    </div>

    <nav class="gks-portal__tabbar" aria-label="Хэрэглэгчийн цэс">
      <NuxtLink
        v-for="item in NAV"
        :key="item.to"
        :to="item.to"
        class="gks-portal__tab"
        :class="{ 'gks-portal__tab--active': isActive(item.to) }"
        :aria-current="isActive(item.to) ? 'page' : undefined"
      >
        <span class="gks-portal__tab-icon">
          <DsIcon :name="item.icon" :size="21" />
          <span v-if="unreadFor(item.to)" class="gks-portal__tab-count gks-tnum">
            {{ unreadFor(item.to) > 9 ? '9+' : unreadFor(item.to) }}
          </span>
          <span v-else-if="item.to === '/app/profile' && needsProfile" class="gks-portal__tab-dot" aria-label="Дутуу мэдээлэл" />
        </span>
        <span class="gks-portal__tab-label">{{ item.short }}</span>
      </NuxtLink>
    </nav>
  </div>
</template>

<style scoped>
.gks-portal { min-height: 100vh; background: var(--surface-page); }

.gks-portal__sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 50;
  width: 256px;
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
  border-right: var(--border-hair) solid var(--line-hairline);
}

.gks-portal__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 0 var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-portal__brand-link { display: flex; align-items: center; gap: var(--sp-3); text-decoration: none; }
.gks-portal__logo { height: 24px; width: auto; display: block; }
.gks-portal__brand-text {
  font-family: var(--font-display);
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-portal__nav { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: var(--sp-4); }
.gks-portal__nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-portal__nav-link:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-portal__nav-link--active { background: var(--surface-selected); color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-portal__dot { margin-left: auto; width: 8px; height: 8px; border-radius: var(--radius-pill); background: var(--red-700); }
.gks-portal__count {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: 11px;
  font-weight: var(--fw-bold);
}
.gks-portal__nav-link--active .gks-portal__count { background: var(--brand-700); }

.gks-portal__sidebar-foot {
  padding: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}
.gks-portal__site-link { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-subtle); text-decoration: none; }
.gks-portal__site-link:hover { color: var(--brand-600); }

.gks-portal__user { display: flex; align-items: center; gap: var(--sp-3); }
.gks-portal__user-avatar {
  flex: none;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--surface-inverse);
  color: var(--text-inverse);
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
}
.gks-portal__user-info { min-width: 0; flex: 1; }
.gks-portal__user-name {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-portal__user-role { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-portal__icon-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-2);
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-portal__icon-btn:hover { background: var(--surface-hover); color: var(--text-strong); }

.gks-portal__body { margin-left: 256px; min-height: 100vh; display: flex; flex-direction: column; }

.gks-portal__topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  min-height: 56px;
  padding: 0 var(--sp-6);
  background: rgba(246, 248, 252, .9);
  backdrop-filter: blur(8px);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-portal__mobile-only { display: none; }
.gks-portal__topbar-title {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-portal__bell { margin-left: auto; }
.gks-portal__crm-link { font-size: var(--fs-caption); color: var(--text-muted); text-decoration: none; }
.gks-portal__crm-link:hover { color: var(--brand-600); }

.gks-portal__main {
  flex: 1;
  width: 100%;
  max-width: var(--container-content);
  margin: 0 auto;
  padding: var(--sp-6);
}

/* An app-shaped screen (the messenger) rather than a document-shaped one:
   no reading-width column, no padding, and a fixed height so the page can
   own its own scroll region instead of growing the window's. */
.gks-portal__main--flush {
  max-width: none;
  padding: 0;
  height: calc(100vh - 56px);
  min-height: 0;
  overflow: hidden;
  /* A flex column, not just a fixed height: `main` is itself a flex item, so
     its height is not a base a percentage child can resolve against. The
     page stretches into it instead. */
  display: flex;
  flex-direction: column;
}

/* ---- Mobile bottom tabs (≤900px) ---- */
.gks-portal__tabbar {
  display: none;
  position: fixed;
  inset: auto 0 0 0;
  z-index: 40;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  background: rgba(255, 255, 255, .94);
  backdrop-filter: blur(12px);
  border-top: var(--border-hair) solid var(--line-hairline);
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
.gks-portal__tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-height: 58px;
  padding: var(--sp-2) 2px;
  color: var(--text-muted);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-portal__tab-icon {
  position: relative;
  display: inline-flex;
  padding: 2px var(--sp-4);
  border-radius: var(--radius-pill);
  transition: var(--transition-control);
}
.gks-portal__tab-label {
  font-size: var(--fs-micro);
  font-weight: var(--fw-medium);
  line-height: 1;
}
.gks-portal__tab--active { color: var(--brand-700); }
.gks-portal__tab--active .gks-portal__tab-icon { background: var(--surface-selected); }
.gks-portal__tab--active .gks-portal__tab-label { font-weight: var(--fw-semibold); }
.gks-portal__tab-dot {
  position: absolute;
  top: -1px;
  right: var(--sp-2);
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--red-700);
  box-shadow: 0 0 0 2px var(--surface-card);
}
.gks-portal__tab-count {
  position: absolute;
  top: -5px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: 10px;
  font-weight: var(--fw-bold);
  box-shadow: 0 0 0 2px var(--surface-card);
}

@media (max-width: 900px) {
  .gks-portal__sidebar { display: none; }
  .gks-portal__tabbar { display: grid; }

  .gks-portal__body { margin-left: 0; }
  .gks-portal__mobile-only { display: inline-flex; }
  .gks-portal__topbar { padding: 0 var(--gutter-mobile); }

  /* Clear the fixed tab bar so the last card is never trapped under it. */
  .gks-portal__main {
    padding: var(--sp-5) var(--gutter-mobile)
      calc(var(--sp-8) + 58px + env(safe-area-inset-bottom, 0px));
  }

  /* A flush screen clears the tab bar with height rather than padding — its
     own scroll region has to end above the bar, not run behind it. */
  .gks-portal__main--flush {
    padding: 0;
    height: calc(100vh - 56px - 58px - env(safe-area-inset-bottom, 0px));
  }
}
</style>
