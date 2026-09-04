import type { ClientActivityEntry, ClientWorkspace, WorkspaceCase } from '@gks/shared';

/**
 * The CRM client workspace's shared state (1G-17).
 *
 * One `/clients/:id/workspace` call feeds the header and all five tabs, so
 * switching tabs never refetches and every tab shows the same stage, the same
 * progress and the same next step. Mutations call `refresh()`.
 */
export function useClientWorkspace(clientId: Ref<string>) {
  const api = useApi();

  const data = ref<ClientWorkspace | null>(null);
  const activity = ref<ClientActivityEntry[] | null>(null);
  const pending = ref(false);
  const error = ref<string | null>(null);

  /** Which of the client's cases the tabs act on — the live one by default. */
  const selectedCaseId = ref<string | null>(null);

  async function load(): Promise<void> {
    pending.value = true;
    error.value = null;
    try {
      const result = await api.get<ClientWorkspace>(`/clients/${clientId.value}/workspace`);
      data.value = result;
      if (!selectedCaseId.value || !result.cases.some((row) => row.id === selectedCaseId.value)) {
        selectedCaseId.value = result.activeCaseId;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Мэдээллийг ачаалж чадсангүй';
    } finally {
      pending.value = false;
    }
  }

  /** The merged timeline is only fetched when the Activity tab is opened. */
  async function loadActivity(force = false): Promise<void> {
    if (activity.value && !force) return;
    activity.value = await api.get<ClientActivityEntry[]>(`/clients/${clientId.value}/activity`);
  }

  async function refresh(): Promise<void> {
    await load();
    if (activity.value) await loadActivity(true);
  }

  const client = computed(() => data.value?.client ?? null);
  const cases = computed<WorkspaceCase[]>(() => data.value?.cases ?? []);
  const activeCase = computed<WorkspaceCase | null>(
    () => cases.value.find((row) => row.id === selectedCaseId.value) ?? null,
  );
  /** Alerts for the case in view; a client with no case has none. */
  const alerts = computed(() =>
    (data.value?.alerts ?? []).filter((alert) => !alert.caseId || alert.caseId === selectedCaseId.value),
  );

  return { data, client, cases, activeCase, alerts, activity, selectedCaseId, pending, error, load, loadActivity, refresh };
}
