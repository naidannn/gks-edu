<script setup lang="ts">
import type { NotificationEvent } from '@gks/shared';
import { NOTIFICATION_EVENT_ICONS, formatRelativeMn } from '~/utils/notifications';

/**
 * 1G-05 — the notification bell. Sits in both the CRM and the portal topbar;
 * the API already scopes the list to the logged-in user, so the same component
 * serves staff and clients.
 */
const { items, unread, pending, loaded, load, refreshCount, markRead, markAllRead } = useNotifications();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

/** Poll while the tab is visible — a five-minute-old badge is not a bug worth a socket. */
const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  void refreshCount();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshCount();
  }, POLL_MS);
  document.addEventListener('click', onDocumentClick);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener('click', onDocumentClick);
});

function onDocumentClick(event: MouseEvent) {
  if (!open.value) return;
  if (root.value && !root.value.contains(event.target as Node)) open.value = false;
}

async function toggle() {
  open.value = !open.value;
  if (open.value && !loaded.value) await load();
}

async function openItem(id: string, link: string | null) {
  await markRead(id);
  open.value = false;
  if (!link) return;
  // Server links are absolute (`APP_PUBLIC_URL`); route inside the app when we can.
  const path = link.startsWith('http') ? new URL(link).pathname + new URL(link).search : link;
  await navigateTo(path);
}

function iconFor(event: NotificationEvent): string {
  return NOTIFICATION_EVENT_ICONS[event] ?? 'bell';
}
</script>

<template>
  <div ref="root" class="gks-bell">
    <button
      type="button"
      class="gks-bell__btn"
      :aria-expanded="open"
      :aria-label="unread ? `Мэдэгдэл (${unread} шинэ)` : 'Мэдэгдэл'"
      @click="toggle"
    >
      <DsIcon name="bell" :size="18" />
      <span v-if="unread" class="gks-bell__dot gks-tnum">{{ unread > 99 ? '99+' : unread }}</span>
    </button>

    <div v-if="open" class="gks-bell__panel" role="dialog" aria-label="Мэдэгдлүүд">
      <header class="gks-bell__head">
        <span class="gks-bell__title">Мэдэгдэл</span>
        <button v-if="unread" type="button" class="gks-bell__all" @click="markAllRead">
          Бүгдийг уншсан
        </button>
      </header>

      <p v-if="pending && !items.length" class="gks-bell__empty">Уншиж байна…</p>
      <p v-else-if="!items.length" class="gks-bell__empty">Одоогоор мэдэгдэл алга.</p>

      <ul v-else class="gks-bell__list">
        <li v-for="item in items" :key="item.id">
          <button
            type="button"
            class="gks-bell__item"
            :class="{ 'gks-bell__item--unread': !item.readAt }"
            @click="openItem(item.id, item.link)"
          >
            <DsIcon :name="iconFor(item.event)" :size="16" class="gks-bell__item-icon" />
            <span class="gks-bell__item-body">
              <span class="gks-bell__item-title">{{ item.title }}</span>
              <span class="gks-bell__item-text">{{ item.body }}</span>
              <span class="gks-bell__item-time gks-tnum">{{ formatRelativeMn(item.createdAt) }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.gks-bell { position: relative; }

.gks-bell__btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-md);
  background: var(--surface-card);
  color: var(--text-subtle);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.gks-bell__btn:hover { color: var(--text-strong); border-color: var(--line-strong); }

.gks-bell__dot {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--accent-strong, #c8102e);
  color: #fff;
  font-size: 10px;
  font-weight: var(--fw-bold);
  line-height: 18px;
  text-align: center;
}

.gks-bell__panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 80;
  width: min(380px, calc(100vw - 32px));
  max-height: 70vh;
  overflow-y: auto;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, 0 12px 32px rgb(0 0 0 / 12%));
}

.gks-bell__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp-4) var(--sp-4) var(--sp-3);
  border-bottom: var(--border-hair) solid var(--line-hairline);
}
.gks-bell__title { font-weight: var(--fw-semibold); }
.gks-bell__all {
  border: none;
  background: none;
  padding: 0;
  color: var(--text-subtle);
  font-size: var(--fs-micro);
  cursor: pointer;
  text-decoration: underline;
}

.gks-bell__empty { padding: var(--sp-6) var(--sp-4); color: var(--text-subtle); font-size: var(--fs-small); text-align: center; }

.gks-bell__list { list-style: none; margin: 0; padding: 0; }

.gks-bell__item {
  display: flex;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border: none;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: none;
  text-align: left;
  cursor: pointer;
}
.gks-bell__item:hover { background: var(--surface-page); }
.gks-bell__item--unread { background: color-mix(in oklab, var(--accent-strong, #c8102e) 5%, transparent); }

.gks-bell__item-icon { flex: none; margin-top: 2px; color: var(--text-subtle); }
.gks-bell__item-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gks-bell__item-title { font-size: var(--fs-small); font-weight: var(--fw-semibold); }
.gks-bell__item-text {
  font-size: var(--fs-micro);
  color: var(--text-subtle);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.gks-bell__item-time { font-size: 11px; color: var(--text-muted, var(--text-subtle)); }
</style>
