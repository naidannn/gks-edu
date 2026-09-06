<script setup lang="ts">
import type { AdminNavGroup } from '~/composables/useAdminShell';
import { useAuthStore } from '~/stores/auth';

/**
 * CRM shell: sidebar + slim topbar. Every `/admin/*` page uses this instead of
 * the public `default` layout — no marketing header/footer here.
 *
 * The shell is built for people who live in it all day, so it gives the work
 * area everything it can: no reading-width container (a CRM table wants the
 * whole monitor, unlike an article), a sidebar that folds to an icon rail, a
 * compact-density switch, and ⌘K to reach any screen or client without
 * touching the mouse. The nav map itself lives in `useAdminShell` because the
 * command palette searches the same list the sidebar renders.
 */
const auth = useAuthStore();
const route = useRoute();

const { rail, density, paletteOpen, restore, toggleRail, toggleDensity } = useAdminShell();

/**
 * The shared chat inbox is the one queue in the CRM that is measured in
 * minutes, so its count belongs in the sidebar on every screen — not only on
 * the screen that shows it. The live connection is opened here for the same
 * reason (1J).
 */
const messenger = useMessengerStream();
const unreadFor = (to: string): number => (to === '/admin/messages' ? messenger.unread.value.threads : 0);

const sidebarOpen = ref(false);
watch(() => route.fullPath, () => { sidebarOpen.value = false; });

function isActive(to: string, exact = false): boolean {
  // '/admin' itself must not light up for every '/admin/*' sub-route.
  if (exact || to === '/admin') return route.path === to;
  return route.path === to || route.path.startsWith(`${to}/`);
}

const currentSection = computed(() => findAdminNavItem(route.path)?.label ?? 'CRM');
/** True on a record page, where the topbar shows "section → this record". */
const isDetail = computed(() => {
  const item = findAdminNavItem(route.path);
  return Boolean(item && item.to !== route.path);
});

/**
 * A folded group opens itself when the page inside it is the one on screen,
 * so a deep link never lands on a nav that hides where you are.
 */
const openGroups = ref(new Set<string>());
watch(
  () => route.path,
  () => {
    for (const group of ADMIN_NAV) {
      if (group.title && group.items.some((item) => isActive(item.to, item.exact))) openGroups.value.add(group.title);
    }
  },
  { immediate: true },
);

function isOpen(group: AdminNavGroup): boolean {
  // A folded rail has no room for headings, so every group renders flat.
  if (rail.value) return true;
  return !group.collapsible || Boolean(group.title && openGroups.value.has(group.title));
}
function toggleGroup(group: AdminNavGroup) {
  if (!group.title) return;
  const next = new Set(openGroups.value);
  if (next.has(group.title)) next.delete(group.title);
  else next.add(group.title);
  openGroups.value = next;
}

/**
 * Global keys. `/` and the single-letter shortcuts stay out of the way while
 * a field has focus — otherwise typing a name into a filter would open the
 * palette instead.
 */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

function onKeydown(event: KeyboardEvent) {
  const meta = event.metaKey || event.ctrlKey;

  if (meta && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    paletteOpen.value = !paletteOpen.value;
    return;
  }
  if (meta && event.key === '\\') {
    event.preventDefault();
    toggleRail();
    return;
  }
  if (isTyping(event.target) || meta || event.altKey) return;

  if (event.key === '/') {
    // Hand `/` to the page's own search box when it has one, so the muscle
    // memory works on a list screen and still opens the palette elsewhere.
    // Search fields first — a page can have a plain text field above its
    // filter bar, and that is not what `/` means.
    const search = document.querySelector<HTMLInputElement>('main input[type="search"]')
      ?? document.querySelector<HTMLInputElement>('main input.gks-filters__search');
    event.preventDefault();
    if (search) search.focus();
    else paletteOpen.value = true;
  }
}

onMounted(() => {
  restore();
  window.addEventListener('keydown', onKeydown);
  messenger.connect();
  messenger.refreshUnread();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  messenger.disconnect();
});

async function onLogout() {
  await auth.logout();
  await navigateTo('/login');
}
</script>

<template>
  <div
    class="gks-admin"
    :class="{ 'gks-admin--sidebar-open': sidebarOpen, 'gks-admin--rail': rail }"
    :data-density="density"
  >
    <aside class="gks-admin__sidebar">
      <div class="gks-admin__brand">
        <NuxtLink to="/admin" class="gks-admin__brand-link" :title="rail ? 'GKS CRM' : undefined">
          <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-admin__logo">
          <span class="gks-admin__brand-text">CRM</span>
        </NuxtLink>
        <button type="button" class="gks-admin__icon-btn gks-admin__close" aria-label="Цэс хаах" @click="sidebarOpen = false">
          <DsIcon name="x" :size="20" />
        </button>
      </div>

      <nav class="gks-admin__nav" aria-label="Админ цэс">
        <div v-for="(group, index) in ADMIN_NAV" :key="group.title ?? 'primary'" class="gks-admin__group">
          <template v-if="!rail">
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
          </template>

          <template v-if="isOpen(group)">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="gks-admin__nav-link"
              :class="{ 'gks-admin__nav-link--active': isActive(item.to, item.exact) }"
              :title="rail ? item.label : undefined"
            >
              <DsIcon :name="item.icon" :size="18" />
              <span class="gks-admin__nav-label">{{ item.label }}</span>
              <span
                v-if="unreadFor(item.to)"
                class="gks-admin__nav-count gks-tnum"
                :title="`${unreadFor(item.to)} хариу хүлээж буй чат`"
              >{{ unreadFor(item.to) > 99 ? '99+' : unreadFor(item.to) }}</span>
            </NuxtLink>
          </template>

          <span v-if="index === 0 || rail" class="gks-admin__divider" aria-hidden="true" />
        </div>
      </nav>

      <div class="gks-admin__sidebar-foot">
        <NuxtLink to="/" class="gks-admin__site-link" :title="rail ? 'Вебсайт руу буцах' : undefined">
          <DsIcon name="arrow-left" :size="16" />
          <span class="gks-admin__nav-label">Вебсайт руу буцах</span>
        </NuxtLink>

        <ClientOnly>
          <div class="gks-admin__user">
            <div class="gks-admin__user-avatar" :title="auth.user?.name ?? auth.user?.email ?? ''">
              {{ (auth.user?.name ?? auth.user?.email ?? '?').slice(0, 1).toUpperCase() }}
            </div>
            <div class="gks-admin__user-info">
              <p class="gks-admin__user-name">{{ auth.user?.name ?? auth.user?.email }}</p>
              <p class="gks-admin__user-role">{{ auth.user?.role ? ROLE_LABELS[auth.user.role] : '' }}</p>
            </div>
            <NuxtLink
              to="/admin/account"
              class="gks-admin__icon-btn"
              aria-label="Миний бүртгэл"
              title="Миний бүртгэл — нууц үг солих"
            >
              <DsIcon name="key-round" :size="18" />
            </NuxtLink>
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
        <button
          type="button"
          class="gks-admin__icon-btn gks-admin__rail-btn"
          :aria-label="rail ? 'Цэсийг дэлгэх' : 'Цэсийг нарийсгах'"
          :title="`${rail ? 'Цэсийг дэлгэх' : 'Цэсийг нарийсгах'} (⌘\\)`"
          @click="toggleRail"
        >
          <DsIcon :name="rail ? 'panel-left-open' : 'panel-left-close'" :size="18" />
        </button>

        <nav class="gks-admin__crumbs" aria-label="Замчлал">
          <span class="gks-admin__crumb">{{ currentSection }}</span>
          <template v-if="isDetail">
            <DsIcon name="chevron-right" :size="13" />
            <span class="gks-admin__crumb gks-admin__crumb--current">Дэлгэрэнгүй</span>
          </template>
        </nav>

        <button type="button" class="gks-admin__search" @click="paletteOpen = true">
          <DsIcon name="search" :size="16" />
          <span class="gks-admin__search-text">Хайх…</span>
          <kbd class="gks-kbd">⌘K</kbd>
        </button>

        <button
          type="button"
          class="gks-admin__icon-btn"
          :aria-pressed="density === 'compact'"
          :title="density === 'compact' ? 'Тансаг харагдац' : 'Нягт харагдац'"
          aria-label="Мөрийн нягтрал"
          @click="toggleDensity"
        >
          <DsIcon :name="density === 'compact' ? 'rows-3' : 'rows-2'" :size="18" />
        </button>

        <ClientOnly>
          <NotificationsBell />
        </ClientOnly>
      </header>

      <main class="gks-admin__main">
        <slot />
      </main>
    </div>

    <ClientOnly>
      <AdminCommandPalette v-if="paletteOpen" @close="paletteOpen = false" />
    </ClientOnly>
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
  width: var(--admin-sidebar-w);
  display: flex;
  flex-direction: column;
  background: var(--surface-card);
  border-right: var(--border-hair) solid var(--line-hairline);
  transition: transform var(--dur-base) var(--ease-standard), width var(--dur-base) var(--ease-standard);
}
.gks-admin--rail .gks-admin__sidebar { width: var(--admin-rail-w); }

.gks-admin__brand {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: var(--admin-topbar-h);
  padding: 0 var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-admin--rail .gks-admin__brand { padding: 0; justify-content: center; }
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

.gks-admin__nav { flex: 1; display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4) var(--sp-3); overflow-y: auto; }
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
.gks-admin--rail .gks-admin__divider { margin: var(--sp-2) var(--sp-2) 0; }

.gks-admin__nav-link {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-medium);
  color: var(--text-muted);
  text-decoration: none;
  white-space: nowrap;
  transition: var(--transition-control);
}
.gks-admin__nav-link:hover { background: var(--surface-hover); color: var(--text-strong); }
.gks-admin__nav-link--active {
  background: var(--surface-selected);
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
}
.gks-admin__nav-count {
  margin-left: auto;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
  background: var(--red-700);
  color: var(--text-inverse);
  font-size: 11px;
  font-weight: var(--fw-bold);
}
/* Folded to the rail there is no label to sit beside, so the count becomes a
   corner dot on the icon rather than disappearing with the text. */
.gks-admin--rail .gks-admin__nav-link { justify-content: center; padding: var(--sp-3) 0; position: relative; }
.gks-admin--rail .gks-admin__nav-count {
  position: absolute;
  top: 4px;
  right: 8px;
  margin: 0;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
}
.gks-admin--rail .gks-admin__nav-label,
.gks-admin--rail .gks-admin__brand-text,
.gks-admin--rail .gks-admin__user-info { display: none; }

.gks-admin__sidebar-foot {
  padding: var(--sp-4) var(--sp-3);
  border-top: var(--border-hair) solid var(--line-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.gks-admin__site-link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 0 var(--sp-2);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  text-decoration: none;
}
.gks-admin__site-link:hover { color: var(--brand-600); }
.gks-admin--rail .gks-admin__site-link,
.gks-admin--rail .gks-admin__user { justify-content: center; padding: 0; }

.gks-admin__user { display: flex; align-items: center; gap: var(--sp-3); padding: 0 var(--sp-2); }
.gks-admin__user--loading { min-height: 32px; }
.gks-admin--rail .gks-admin__user { flex-direction: column; gap: var(--sp-2); }
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
.gks-admin__icon-btn[aria-pressed='true'] { background: var(--surface-selected); color: var(--brand-700); }

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
.gks-admin__body {
  margin-left: var(--admin-sidebar-w);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  transition: margin-left var(--dur-base) var(--ease-standard);
}
.gks-admin--rail .gks-admin__body { margin-left: var(--admin-rail-w); }

.gks-admin__topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-height: var(--admin-topbar-h);
  padding: 0 var(--admin-gutter);
  background: rgba(246, 248, 252, .88);
  backdrop-filter: blur(10px);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-admin__menu-btn { display: none; }

.gks-admin__crumbs {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
  color: var(--text-subtle);
}
.gks-admin__crumb {
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--text-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.gks-admin__crumb--current { color: var(--text-strong); }

/* The palette's handle. Pushed right so the topbar reads left-to-right:
   where you are, then what you can reach. */
.gks-admin__search {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 220px;
  height: 32px;
  padding: 0 var(--sp-2) 0 var(--sp-3);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-admin__search:hover { border-color: var(--line-strong); color: var(--text-body); }
.gks-admin__search-text { flex: 1; text-align: left; }

.gks-admin__main {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: var(--sp-6) var(--admin-gutter) var(--sp-9);
}

/* ---- Mobile: sidebar becomes an off-canvas drawer ---- */
@media (max-width: 900px) {
  .gks-admin__sidebar,
  .gks-admin--rail .gks-admin__sidebar {
    width: 280px;
    transform: translateX(-100%);
    box-shadow: var(--shadow-dialog);
  }
  /* The drawer is always the full menu — a rail makes no sense over a scrim. */
  .gks-admin--rail .gks-admin__nav-label,
  .gks-admin--rail .gks-admin__brand-text,
  .gks-admin--rail .gks-admin__user-info { display: revert; }
  .gks-admin--rail .gks-admin__nav-link { justify-content: flex-start; padding: var(--sp-3); }
  .gks-admin--rail .gks-admin__brand { padding: 0 var(--sp-5); justify-content: space-between; }
  .gks-admin--rail .gks-admin__user { flex-direction: row; }

  .gks-admin--sidebar-open .gks-admin__sidebar { transform: translateX(0); }
  .gks-admin--sidebar-open .gks-admin__scrim { display: block; }
  .gks-admin__icon-btn.gks-admin__close { display: inline-flex; }

  .gks-admin__body,
  .gks-admin--rail .gks-admin__body { margin-left: 0; }
  .gks-admin__menu-btn { display: inline-flex; }
  .gks-admin__rail-btn { display: none; }
  .gks-admin__main { padding: var(--sp-5) var(--admin-gutter) var(--sp-9); }
}

/* Below the phone breakpoint the search collapses to its icon — the label and
   the ⌘K hint are both useless on a touch keyboard. */
@media (max-width: 640px) {
  .gks-admin__search { min-width: 0; padding: 0 var(--sp-2); }
  .gks-admin__search-text, .gks-admin__search .gks-kbd { display: none; }
  .gks-admin__crumbs { flex: 1; }
}
</style>
