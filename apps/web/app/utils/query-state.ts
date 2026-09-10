/**
 * Reading and writing a list page's state in the address bar.
 *
 * Five public pages each carried their own copy of this: the same `str`, the
 * same `num`, the same `apply` that merges a patch and drops the empties, the
 * same 350ms search timer. The copies had already diverged — one of them
 * coerced `true` to `'1'` and the others did not — and one of them, the
 * case-start page, kept its state in refs instead and grew a watcher that
 * silently dropped the round out of every deep link (`1N-46`). The URL is the
 * state; there is one description of what that means.
 *
 * The pure half lives here so it can be unit-tested — this app cannot mock
 * `$fetch`, so anything a page decides is extracted and checked directly.
 * `useQueryState` binds it to the router.
 */

/** A query parameter given twice arrives as an array; that is not a value. */
export function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

/** Page numbers and limits: a positive integer, or the page's own default. */
export function readNumber(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(readString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** A checkbox in a URL is `?gks=1`; anything else is off. */
export function readFlag(value: unknown): boolean {
  return readString(value) === '1';
}

export type QueryPatch = Record<string, string | number | boolean | undefined | null>;

export interface MergeQueryOptions {
  /** Reset paging: a new filter means page 1, never page 7 of a different list. */
  resetPage?: boolean;
  pageKey?: string;
}

/**
 * The current query with `patch` folded in, as strings.
 *
 * Empty, `false`, `null` and `undefined` drop the parameter rather than
 * writing `?region=` into the bar — an absent filter and a filter set to
 * nothing are the same view, and only one of them should have a URL.
 */
export function mergeQuery(
  current: Record<string, unknown>,
  patch: QueryPatch,
  options: MergeQueryOptions = {},
): Record<string, string> {
  const { resetPage = true, pageKey = 'page' } = options;
  const merged: Record<string, unknown> = { ...current, ...patch };

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(merged)) {
    if (resetPage && key === pageKey) continue;
    if (value === '' || value === false || value === undefined || value === null) continue;
    out[key] = value === true ? '1' : String(value);
  }
  return out;
}
