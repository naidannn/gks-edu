import type { UniversityCard } from '@gks/shared';

/**
 * The whole school catalogue (135 records) in one list, for the selects on the
 * CRM forms. Small enough to fetch once per page rather than search remotely.
 */
export function useUniversityCatalogue() {
  const api = useApi();
  const universities = ref<UniversityCard[]>([]);
  const loading = ref(true);

  async function load() {
    type Paginated = { items: UniversityCard[]; meta: { totalPages: number } };
    loading.value = true;
    try {
      const first = await api.get<Paginated>('/universities', { query: { page: 1, limit: 100, sort: 'name' } });
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, index) =>
          api.get<Paginated>('/universities', { query: { page: index + 2, limit: 100, sort: 'name' } })),
      );
      universities.value = [first, ...rest].flatMap((page) => page.items);
    } finally {
      loading.value = false;
    }
  }

  return { universities, loading, load };
}
