import type { Ref } from 'vue';

/**
 * Keeps a list page's filters in the address bar.
 *
 * Before this, a filtered queue was a dead end: refresh and you were back at
 * "all", and there was no way to send a colleague "the four clients with
 * missing paperwork" other than telling them which boxes to tick. Now the URL
 * *is* the view — bookmarkable, shareable, and restored on reload.
 *
 * `replace` rather than `push`, so Back leaves the page instead of walking
 * through every keystroke of the search box.
 */

/** Either the ref on its own, or the ref plus the only values it may take. */
export type UrlFilter = Ref<string> | [Ref<string>, readonly string[]];

export function useUrlFilters(fields: Record<string, UrlFilter>) {
  const route = useRoute();
  const router = useRouter();

  const entries = Object.entries(fields).map(([key, filter]) => {
    const [target, allow] = Array.isArray(filter) ? filter : [filter, undefined];
    // Whatever the page initialised it to — the value we leave out of the URL.
    return { key, ref: target, allow, initial: target.value };
  });

  // Seed from the URL. A value this page does not offer is dropped rather than
  // forwarded to the API, so a mistyped link degrades to "no filter" instead
  // of a validation error.
  for (const entry of entries) {
    const raw = route.query[entry.key];
    if (typeof raw !== 'string') continue;
    if (entry.allow && !entry.allow.includes(raw)) continue;
    entry.ref.value = raw;
  }

  watch(
    entries.map((entry) => entry.ref),
    () => {
      const own: Record<string, string> = {};
      for (const entry of entries) {
        if (entry.ref.value && entry.ref.value !== entry.initial) own[entry.key] = entry.ref.value;
      }
      // Anything the page did not declare (a `caseId` scope, say) stays put.
      const kept = Object.fromEntries(
        Object.entries(route.query).filter(([key]) => !(key in fields)),
      );
      router.replace({ query: { ...kept, ...own } });
    },
  );
}
