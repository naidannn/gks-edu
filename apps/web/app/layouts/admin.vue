<script setup lang="ts">
import { useAuthStore } from '~/stores/auth';

/**
 * CRM shell: fixed sidebar + slim topbar. Every `/admin/*` page uses this
 * instead of the public `default` layout — no marketing header/footer here.
 */
const auth = useAuthStore();
const route = useRoute();

interface AdminNavItem {
  to: string;
  label: string;
  icon: string;
  /**
   * Highlight on this exact path only. Needed where a sibling route lives
   * under the same prefix — `/admin/consultations` vs `.../board`.
   */
  exact?: boolean;
}

interface AdminNavGroup {
  /** Null for the primary block, which needs no heading. */
  title: string | null;
  items: AdminNavItem[];
  /** Secondary blocks start folded — progressive disclosure (1G-17). */
  collapsible?: boolean;
}

/**
 * Client-centric navigation (1G-17).
 *
 * The primary block is the daily loop: what needs attention, the enquiries
 * coming in, the people under contract, the work queue. Contracts, payments,
 * documents, applications and visa are no longer top-level destinations —
 * they live inside a client's workspace, and their cross-client queues sit in
 * "Үйл ажиллагаа" for the days someone works one function across everybody.
 */
const NAV: AdminNavGroup[] = [
  {
    title: null,
    items: [
      { to: '/admin', label: 'Хяналтын самбар', icon: 'layout-dashboard' },
      { to: '/admin/consultations', label: 'Зөвлөгөө хүсэлт', icon: 'message-square', exact: true },
      { to: '/admin/consultations/board', label: 'Борлуулалтын самбар', icon: 'kanban' },
      { to: '/admin/clients', label: 'Үйлчлүүлэгч', icon: 'users' },
      { to: '/admin/work-tasks', label: 'Ажил & хуваарь', icon: 'list-checks' },
    ],
  },
  {
    title: 'Лавлах',
    items: [{ to: '/admin/universities', label: 'Сургууль', icon: 'school' }],
  },
  {
    title: 'Үйл ажиллагаа',
    collapsible: true,
    items: [
      { to: '/admin/cases', label: 'Хэрэг', icon: 'folder' },
      { to: '/admin/documents', label: 'Материал шалгах', icon: 'file-check-2' },
      { to: '/admin/applications', label: 'Мэдүүлэг', icon: 'graduation-cap' },
      { to: '/admin/visa', label: 'Виз', icon: 'plane' },
      { to: '/admin/contracts', label: 'Гэрээ', icon: 'file-text' },
      { to: '/admin/payments', label: 'Төлбөр', icon: 'credit-card' },
    ],
  },
  {
    title: 'Тайлан',
    collapsible: true,
    items: [{ to: '/admin/reports', label: 'Удирдлагын тайлан', icon: 'chart-column' }],
  },
  {
    title: 'Тохиргоо',
    collapsible: true,
    items: [
      { to: '/admin/settings/pricing', label: 'Үнийн тохиргоо', icon: 'settings' },
      { to: '/admin/settings/contract-templates', label: 'Гэрээний загвар', icon: 'file-cog' },
      { to: '/admin/settings/document-templates', label: 'Материалын загвар', icon: 'folder-cog' },
      { to: '/admin/settings/notifications', label: 'Мэдэгдлийн загвар', icon: 'bell-ring' },
      { to: '/admin/content', label: 'Контент', icon: 'newspaper' },
      { to: '/admin/settings/staff', label: 'Ажилтан', icon: 'user-cog' },
    ],
  },
];

const sidebarOpen = ref(false);
watch(() => route.fullPath, () => { sidebarOpen.value = false; });

function isActive(to: string, exact = false): boolean {
  // '/admin' itself must not light up for every '/admin/*' sub-route.
  if (exact || to === '/admin') return route.path === to;
  return route.path === to || route.path.startsWith(`${to}/`);
}

const allItems = computed(() => NAV.flatMap((group) => group.items));
const currentSection = computed(
  () => allItems.value.find((item) => isActive(item.to, item.exact))?.label ?? 'CRM',
);

/**
 * A folded group opens itself when the page inside it is the one on screen,
 * so a deep link never lands on a nav that hides where you are.
 */
const openGroups = ref(new Set<string>());
watch(
  () => route.path,
  () => {
    for (const group of NAV) {
      if (group.title && group.items.some((item) => isActive(item.to, item.exact))) openGroups.value.add(group.title);
    }
  },
  { immediate: true },
);

function isOpen(group: AdminNavGroup): boolean {
  return !group.collapsible || Boolean(group.title && openGroups.value.has(group.title));
}
function toggleGroup(group: AdminNavGroup) {
  if (!group.title) return;
  const next = new Set(openGroups.value);
  if (next.has(group.title)) next.delete(group.title);
  else next.add(group.title);
  openGroups.value = next;
}

async function onLogout() {
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="gks-admin" :class="{ 'gks-admin--sidebar-open': sidebarOpen }">
    <aside class="gks-admin__sidebar">
      <div class="gks-admin__brand">
        <NuxtLink to="/admin" class="gks-admin__brand-link">
          <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-admin__logo">
          <span class="gks-admin__brand-text">CRM</span>
        </NuxtLink>
        <button type="button" class="gks-admin__icon-btn gks-admin__close" aria-label="Цэс хаах" @click="sidebarOpen = false">
          <DsIcon name="x" :size="20" />
        </button>
      </div>

      <nav class="gks-admin__nav" aria-label="Админ цэс">
        <div v-for="(group, index) in NAV" :key="group.title ?? 'primary'" class="gks-admin__group">
          <button
            v-if="group.title && group.collapsible"
            type="button"
            class="gks-admin__group-toggle"
            :aria-expanded="isOpen(group)"
            @click="toggleGroup(group)"
          >
            <span>{{ group.title }}</span>
            <DsIcon :name="isOpen(group) ? 'chevron-down' : 'chevron-right'" :size="14" />
          </button>
          <p v-else-if="group.title" class="gks-admin__group-title">{{ group.title }}</p>

          <template v-if="isOpen(group)">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="gks-admin__nav-link"
              :class="{ 'gks-admin__nav-link--active': isActive(item.to, item.exact) }"
            >
              <DsIcon :name="item.icon" :size="18" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </template>

          <span v-if="index === 0" class="gks-admin__divider" aria-hidden="true" />
        </div>
      </nav>

      <div class="gks-admin__sidebar-foot">
        <NuxtLink to="/" class="gks-admin__site-link">
          <DsIcon name="arrow-left" :size="16" />
          <span>Вебсайт руу буцах</span>
        </NuxtLink>

        <ClientOnly>
          <div class="gks-admin__user">
            <div class="gks-admin__user-avatar" aria-hidden="true">
              {{ (auth.user?.name ?? auth.user?.email ?? '?').slice(0, 1).toUpperCase() }}
            </div>
            <div class="gks-admin__user-info">
              <p class="gks-admin__user-name">{{ auth.user?.name ?? auth.user?.email }}</p>
              <p class="gks-admin__user-role">{{ auth.user?.role ? ROLE_LABELS[auth.user.role] : '' }}</p>
            </div>
            <button type="button" class="gks-admin__icon-btn" aria-label="Гарах" title="Гарах" @click="onLogout">
              <DsIcon name="log-out" :size="18" />
            </button>
          </div>
          <template #fallback>
            <div class="gks-admin__user gks-admin__user--loading" aria-hidden="true" />
          </template>
        </ClientOnly>
      </div>
    </aside>

    <button
      type="button"
      class="gks-admin__scrim"
      aria-label="Цэс хаах"
      tabindex="-1"
      @click="sidebarOpen = false"
    />

    <div class="gks-admin__body">
      <header class="gks-admin__topbar">
        <button type="button" class="gks-admin__icon-btn gks-admin__menu-btn" aria-label="Цэс нээх" @click="sidebarOpen = true">
          <DsIcon name="menu" :size="20" />
        </button>
        <span class="gks-admin__topbar-title">{{ currentSection }}</span>
        <ClientOnly>
          <NotificationsBell class="gks-admin__bell" />
        </ClientOnly>
      </header>

      <main class="gks-admin__main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.gks-admin {
  min-height: 100vh;
  background: var(--surface-page);
}

/* ---- Sidebar ---- */
.gks-admin__sidebar {
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

.gks-admin__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 0 var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-admin__brand-link { display: flex; align-items: center; gap: var(--sp-3); text-decoration: none; }
.gks-admin__logo { height: 24px; width: auto; display: block; }
.gks-admin__brand-text {
  font-family: var(--font-display);
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-admin__icon-btn.gks-admin__close { display: none; }

.gks-admin__nav { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4); overflow-y: auto; }
.gks-admin__group { display: flex; flex-direction: column; gap: 2px; }
.gks-admin__group-title,
.gks-admin__group-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: transparent;
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
  cursor: default;
}
.gks-admin__group-toggle { cursor: pointer; }
.gks-admin__group-toggle:hover { color: var(--text-strong); }
.gks-admin__divider { height: 1px; margin: var(--sp-2) var(--sp-3) 0; background: var(--line-hairline); }
.gks-admin__nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-3);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-decoration: none;
  transition: var(--transition-control);
}
.gks-admin__nav-link:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-admin__nav-link--active {
  background: var(--surface-selected);
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
}

.gks-admin__sidebar-foot {
  padding: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gks-admin__site-link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  text-decoration: none;
}
.gks-admin__site-link:hover { color: var(--brand-600); }

.gks-admin__user { display: flex; align-items: center; gap: var(--sp-3); }
.gks-admin__user--loading { min-height: 32px; }
.gks-admin__user-avatar {
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
.gks-admin__user-info { min-width: 0; flex: 1; }
.gks-admin__user-name {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gks-admin__user-role { font-size: var(--fs-micro); color: var(--text-subtle); }

.gks-admin__icon-btn {
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
.gks-admin__icon-btn:hover { background: var(--surface-hover); color: var(--text-strong); }

/* ---- Off-canvas scrim (mobile only) ---- */
.gks-admin__scrim {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 40;
  border: 0;
  padding: 0;
  background: var(--scrim);
  cursor: default;
}

/* ---- Body: topbar + main ---- */
.gks-admin__body { margin-left: 256px; min-height: 100vh; display: flex; flex-direction: column; }

.gks-admin__topbar {
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
.gks-admin__menu-btn { display: none; }
.gks-admin__bell { margin-left: auto; }
.gks-admin__topbar-title {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
}

.gks-admin__main {
  flex: 1;
  width: 100%;
  max-width: var(--container-content);
  margin: 0 auto;
  padding: var(--sp-6);
}

/* ---- Mobile: sidebar becomes an off-canvas drawer ---- */
@media (max-width: 900px) {
  .gks-admin__sidebar {
    width: 280px;
    transform: translateX(-100%);
    box-shadow: var(--shadow-dialog);
  }
  .gks-admin--sidebar-open .gks-admin__sidebar { transform: translateX(0); }
  .gks-admin--sidebar-open .gks-admin__scrim { display: block; }
  .gks-admin__icon-btn.gks-admin__close { display: inline-flex; }

  .gks-admin__body { margin-left: 0; }
  .gks-admin__menu-btn { display: inline-flex; }
  .gks-admin__topbar { padding: 0 var(--gutter-mobile); }
  .gks-admin__main { padding: var(--sp-5) var(--gutter-mobile) var(--sp-8); }
}
</style>
