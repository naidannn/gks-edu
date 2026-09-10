import type { PaginatedResult, UniversityCard } from '@gks/shared';

/**
 * The whole school catalogue (135 records) in one list, for the selects on the
 * CRM forms. Small enough to fetch once per page rather than search remotely.
 */
export function useUniversityCatalogue() {
  const api = useApi();
  const universities = ref<UniversityCard[]>([]);
  const loading = ref(true);
  /** An empty picker and a failed fetch look identical on screen otherwise. */
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const first = await api.get<PaginatedResult<UniversityCard>>('/universities', { query: { page: 1, limit: 100, sort: 'name' } });
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
          api.get<PaginatedResult<UniversityCard>>('/universities', { query: { page: index + 2, limit: 100, sort: 'name' } })),
      );
      universities.value = [first, ...rest].flatMap((page) => page.items);
    } catch (e) {
      error.value = apiErrorMessage(e, 'Сургуулийн жагсаалтыг ачаалж чадсангүй');
    } finally {
      loading.value = false;
    }
  }

  return { universities, loading, error, load };
}
