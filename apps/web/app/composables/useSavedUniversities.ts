import type { SavedUniversityEntry } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * A logged-in visitor's university shortlist (1A-18). IDs are cached in a
 * shared `useState` so the save button on a card and the `/account/saved`
 * list stay in sync without refetching on every navigation.
 */
export function useSavedUniversities() {
  const api = useApi();
  const auth = useAuthStore();
  const savedIds = useState<string[]>('saved-university-ids', () => []);
  const loaded = useState('saved-university-ids-loaded', () => false);
  const pending = useState('saved-university-ids-pending', () => false);

  async function ensureLoaded(): Promise<void> {
    if (import.meta.server || !auth.isAuthenticated || loaded.value || pending.value) return;
    pending.value = true;
    try {
      const rows = await api.get<SavedUniversityEntry[]>('/me/saved-universities');
      savedIds.value = rows.map((row) => row.university.id);
      loaded.value = true;
    } catch {
      // Not fatal — the save button just falls back to "not saved" until retried.
    } finally {
      pending.value = false;
    }
  }

  function isSaved(universityId: string): boolean {
    return savedIds.value.includes(universityId);
  }

  async function toggle(universityId: string): Promise<void> {
    if (!auth.isAuthenticated) {
      await navigateTo(`/login?redirect=${encodeURIComponent(useRoute().fullPath)}`);
      return;
    }

    if (isSaved(universityId)) {
      await api.delete(`/me/saved-universities/${universityId}`);
      savedIds.value = savedIds.value.filter((id) => id !== universityId);
    } else {
      await api.post('/me/saved-universities', { universityId });
      savedIds.value = [...savedIds.value, universityId];
    }
  }

  return { savedIds, ensureLoaded, isSaved, toggle };
}
