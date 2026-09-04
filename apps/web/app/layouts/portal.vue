<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * Client cabinet shell (1G-15). Every `/app/*` screen lives here: a fixed
 * sidebar with the four things a client ever needs, and nothing from the
 * marketing site or the CRM.
 */
const auth = useAuthStore();
const route = useRoute();
const { overview, load, needsProfile } = usePortal();

onMounted(() => load());

const NAV = [
  { to: '/app', label: 'Хяналтын самбар', icon: 'layout-dashboard' },
  { to: '/app/cases', label: 'Миний хэрэг', icon: 'folder-open' },
  { to: '/app/profile', label: 'Миний мэдээлэл', icon: 'user-round' },
  { to: '/account/saved', label: 'Хадгалсан сургууль', icon: 'bookmark' },
];

const sidebarOpen = ref(false);
watch(() => route.fullPath, () => { sidebarOpen.value = false; });

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
  <div class="gks-portal" :class="{ 'gks-portal--sidebar-open': sidebarOpen }">
    <aside class="gks-portal__sidebar">
      <div class="gks-portal__brand">
        <NuxtLink to="/app" class="gks-portal__brand-link">
          <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-portal__logo">
          <span class="gks-portal__brand-text">Миний булан</span>
        </NuxtLink>
        <button type="button" class="gks-portal__icon-btn gks-portal__close" aria-label="Цэс хаах" @click="sidebarOpen = false">
          <DsIcon name="x" :size="20" />
        </button>
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
          <span v-if="item.to === '/app/profile' && needsProfile" class="gks-portal__dot" aria-label="Дутуу мэдээлэл" />
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

    <button type="button" class="gks-portal__scrim" aria-label="Цэс хаах" tabindex="-1" @click="sidebarOpen = false" />

    <div class="gks-portal__body">
      <header class="gks-portal__topbar">
        <button type="button" class="gks-portal__icon-btn gks-portal__menu-btn" aria-label="Цэс нээх" @click="sidebarOpen = true">
          <DsIcon name="menu" :size="20" />
        </button>
        <span class="gks-portal__topbar-title">{{ currentSection }}</span>
        <NuxtLink v-if="auth.isStaff" to="/admin" class="gks-portal__crm-link">CRM</NuxtLink>
      </header>

      <main class="gks-portal__main">
        <slot />
      </main>
    </div>
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
  transition: transform var(--dur-base) var(--ease-standard);
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
.gks-portal__close { display: none; }

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

.gks-portal__scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  border: 0;
  padding: 0;
  background: var(--scrim);
  cursor: default;
}

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
.gks-portal__menu-btn { display: none; }
.gks-portal__topbar-title {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-portal__crm-link { margin-left: auto; font-size: var(--fs-caption); color: var(--text-muted); text-decoration: none; }
.gks-portal__crm-link:hover { color: var(--brand-600); }

.gks-portal__main {
  flex: 1;
  width: 100%;
  max-width: var(--container-content);
  margin: 0 auto;
  padding: var(--sp-6);
}

@media (max-width: 900px) {
  .gks-portal__sidebar { width: 280px; transform: translateX(-100%); box-shadow: var(--shadow-dialog); }
  .gks-portal--sidebar-open .gks-portal__sidebar { transform: translateX(0); }
  .gks-portal--sidebar-open .gks-portal__scrim { display: block; }
  .gks-portal__close { display: inline-flex; }

  .gks-portal__body { margin-left: 0; }
  .gks-portal__menu-btn { display: inline-flex; }
  .gks-portal__topbar { padding: 0 var(--gutter-mobile); }
  .gks-portal__main { padding: var(--sp-5) var(--gutter-mobile) var(--sp-8); }
}
</style>
