import type { PortalOverview } from '@gks/shared';

/**
 * The client portal's shared state (1G-15): one `/me/overview` call feeding the
 * layout, the dashboard and the case screens, so every one of them agrees on
 * what the next step is.
 */
export function usePortal() {
  const api = useApi();
  const overview = useState<PortalOverview | null>('portal-overview', () => null);
  const pending = useState<boolean>('portal-pending', () => false);
  const error = useState<string | null>('portal-error', () => null);

  /**
   * Fetches once per session unless `force` is set — every mutation passes
   * true. The layout and the page both call this on mount, so an in-flight
   * request is shared rather than duplicated.
   */
  const inFlight = useState<Promise<void> | null>('portal-inflight', () => null);

  async function load(force = false): Promise<void> {
    if (overview.value && !force) return;
    if (inFlight.value) return inFlight.value;

    pending.value = true;
    error.value = null;
    inFlight.value = (async () => {
      try {
        overview.value = await api.get<PortalOverview>('/me/overview');
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Мэдээллийг ачаалж чадсангүй';
      } finally {
        pending.value = false;
        inFlight.value = null;
      }
    })();

    return inFlight.value;
  }

  const refresh = () => load(true);

  /** The live case the dashboard opens on, if there is one. */
  const activeCase = computed(() => {
    const data = overview.value;
    if (!data) return null;
    return data.cases.find((row) => row.id === data.activeCaseId) ?? null;
  });

  const needsProfile = computed(() => Boolean(overview.value && !overview.value.profile.isComplete));

  return { overview, pending, error, load, refresh, activeCase, needsProfile };
}
