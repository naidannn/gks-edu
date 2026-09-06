import type { StudyFieldGroup } from '@gks/shared';

/**
 * The canonical subject taxonomy — ~90 rows, fetched once per page and reused
 * by every filter and select on it.
 *
 * `admin` loads the staff view, which includes inactive subjects and counts
 * drafts; the public view lists only subjects that actually have a published
 * programme behind them, because an empty entry on a filter panel is a dead end
 * a visitor clicks exactly once.
 */
export function useStudyFields(options: { admin?: boolean } = {}) {
  const api = useApi();
  const groups = ref<StudyFieldGroup[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      groups.value = await api.get<StudyFieldGroup[]>(options.admin ? '/admin/study-fields' : '/study-fields');
    } catch {
      error.value = 'Судлах чиглэлийн жагсаалтыг ачаалж чадсангүй';
    } finally {
      loading.value = false;
    }
  }

  /** Slug → id, for turning a research candidate's `fieldSlug` into a key. */
  const idBySlug = computed(() => studyFieldIdBySlug(groups.value));
  /** id → the subject itself, for naming one on a row. */
  const byId = computed(() => {
    const map = new Map<string, StudyFieldGroup['children'][number] | StudyFieldGroup>();
    for (const group of groups.value) {
      map.set(group.id, group);
      for (const child of group.children) map.set(child.id, child);
    }
    return map;
  });

  return { groups, loading, error, load, idBySlug, byId };
}
