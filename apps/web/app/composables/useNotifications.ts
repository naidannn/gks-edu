import type { NotificationItem, NotificationListResponse } from '@gks/shared';

/**
 * 1G-05 — the in-app notification centre.
 *
 * One shared state per app instance (`useState`), so the bell in the layout
 * and any panel that opens from it agree on the unread count without either
 * re-fetching after the other acts.
 */
export function useNotifications() {
  const api = useApi();

  const items = useState<NotificationItem[]>('notifications:items', () => []);
  const unread = useState<number>('notifications:unread', () => 0);
  const pending = useState<boolean>('notifications:pending', () => false);
  const loaded = useState<boolean>('notifications:loaded', () => false);

  async function load(limit = 20) {
    pending.value = true;
    try {
      const response = await api.get<NotificationListResponse>(`/notifications?limit=${limit}`);
      items.value = response.items;
      unread.value = response.unread;
      loaded.value = true;
    } catch {
      // A failed poll must not blank the bell; the previous list stays.
    } finally {
      pending.value = false;
    }
  }

  async function refreshCount() {
    try {
      const response = await api.get<{ unread: number }>('/notifications/unread-count');
      unread.value = response.unread;
    } catch {
      /* keep the last known count */
    }
  }

  async function markRead(id: string) {
    const target = items.value.find((item) => item.id === id);
    if (!target || target.readAt) return;

    // Optimistic: the panel closes on click, so waiting on the server would
    // show a stale badge for the duration of the navigation.
    target.readAt = new Date().toISOString();
    unread.value = Math.max(0, unread.value - 1);
    await api.post(`/notifications/${id}/read`).catch(() => refreshCount());
  }

  async function markAllRead() {
    if (!unread.value) return;
    for (const item of items.value) item.readAt ??= new Date().toISOString();
    unread.value = 0;
    await api.post('/notifications/read-all').catch(() => refreshCount());
  }

  return { items, unread, pending, loaded, load, refreshCount, markRead, markAllRead };
}
