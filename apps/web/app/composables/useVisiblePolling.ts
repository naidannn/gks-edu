/**
 * Re-runs `task` every `intervalMs` while the component is mounted and the
 * browser tab is visible (2F).
 *
 * Written for `/admin/facebook`, which has no live stream: Meta's webhook lands
 * on the API and nothing pushes it on to the browser, so the inbox asks. Three
 * rules keep that cheap and honest:
 *
 * - A hidden tab does not poll. The office leaves the CRM open all day in a
 *   background tab; polling it would be most of the API's traffic for nothing.
 * - Coming back to the tab runs the task at once, so what is on screen is never
 *   a whole interval stale at the moment somebody looks at it.
 * - A tick never overlaps the previous one. Over the Supabase round trip a slow
 *   answer can outlive the interval, and stacking them only makes it slower.
 */
export function useVisiblePolling(task: () => Promise<unknown>, intervalMs: number): void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let busy = false;

  async function tick(): Promise<void> {
    if (busy || document.hidden) return;
    busy = true;
    try {
      await task();
    } catch {
      // A background refresh that fails keeps the last good state on screen;
      // the next tick, or the person's own action, will say if it persists.
    } finally {
      busy = false;
    }
  }

  function onVisibility(): void {
    if (!document.hidden) void tick();
  }

  onMounted(() => {
    timer = setInterval(() => void tick(), intervalMs);
    document.addEventListener('visibilitychange', onVisibility);
  });

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  });
}
