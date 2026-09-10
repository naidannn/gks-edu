import type { Ref } from 'vue';
import { type QueryPatch, mergeQuery, readFlag, readNumber, readString } from '~/utils/query-state';

export interface QueryStateOptions {
  /** Which parameter carries the page number. */
  pageKey?: string;
  /** How long the search box waits before the URL changes. */
  debounceMs?: number;
  /**
   * `push` gives each view a history entry, which is what a catalogue wants —
   * Back should undo a filter. `replace` suits a form whose every keystroke
   * would otherwise become a step to walk back through.
   */
  mode?: 'push' | 'replace';
}

/**
 * A list page's filters, held in the URL. See `utils/query-state.ts` for why.
 */
export function useQueryState(options: QueryStateOptions = {}) {
  const route = useRoute();
  const router = useRouter();
  const pageKey = options.pageKey ?? 'page';

  /** Read inside a `computed` and the page tracks the URL, as it should. */
  const str = (key: string, fallback = '') => readString(route.query[key], fallback);
  const num = (key: string, fallback = 1) => readNumber(route.query[key], fallback);
  const flag = (key: string) => readFlag(route.query[key]);

  function apply(patch: QueryPatch, resetPage = true): void {
    const query = mergeQuery(route.query, patch, { resetPage, pageKey });
    const to = { query };
    void (options.mode === 'replace' ? router.replace(to) : router.push(to));
  }

  /**
   * A search box bound to one parameter.
   *
   * The returned ref is what the input writes to; the URL follows once typing
   * has stopped, and follows the URL back when the visitor uses Back or opens
   * a shared link.
   */
  function search(key = 'q', delay = options.debounceMs ?? 350): Ref<string> {
    const input = ref(str(key));
    watch(() => str(key), (value) => { input.value = value; });

    let timer: ReturnType<typeof setTimeout> | undefined;
    watch(input, (value) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = value.trim();
        if (next !== str(key)) apply({ [key]: next });
      }, delay);
    });
    onBeforeUnmount(() => clearTimeout(timer));

    return input;
  }

  return { str, num, flag, apply, search };
}
