import type { Faculty } from '@gks/shared';

/**
 * One school's colleges (танхим), for the admin programme form.
 *
 * Scoped to a university on purpose: a faculty belongs to exactly one school,
 * so there is no global list to cache and the fetch follows whichever school
 * the form has selected. Switching school reloads; clearing it empties.
 */
export function useFaculties(universityId: Ref<string> | (() => string)) {
  const api = useApi();
  const id = computed(() => (typeof universityId === 'function' ? universityId() : universityId.value));

  const items = ref<Faculty[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function load() {
    if (!id.value) {
      items.value = [];
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      items.value = await api.get<Faculty[]>('/admin/faculties', { query: { universityId: id.value } });
    } catch (err) {
      error.value = apiErrorMessage(err, 'Танхимуудыг ачаалж чадсангүй');
      items.value = [];
    } finally {
      loading.value = false;
    }
  }

  watch(id, () => load(), { immediate: true });

  /** `<option>`s for the select, plus the honest "no college" answer. */
  const options = computed(() => [
    { value: '', label: 'Танхим тодорхойгүй' },
    ...items.value.map((faculty) => ({
      value: faculty.id,
      label: faculty.nameKo && faculty.nameKo !== faculty.nameMn
        ? `${faculty.nameMn} (${faculty.nameKo})`
        : faculty.nameMn,
    })),
  ]);

  return { items, options, loading, error, load };
}
