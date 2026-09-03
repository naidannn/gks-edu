import type { AsyncData, UseFetchOptions } from '#app';

/**
 * `useFetch` bound to the public API base — SSR-friendly, so catalogue pages
 * render server-side with their data already in the HTML (SEO, 1A-19).
 *
 * Authenticated calls go through `useApi()` instead; nothing here sends a token.
 */
export function useApiFetch<T>(
  path: string | (() => string),
  options: UseFetchOptions<T> = {},
): AsyncData<T | null, Error | null> {
  const config = useRuntimeConfig();
  const merged = { baseURL: config.public.apiBase, ...options };
  // `useFetch`'s option type is conditional on its result generic, which a thin
  // wrapper cannot satisfy; the public contract is the annotated return type.
  return useFetch<T>(path, merged as never) as AsyncData<T | null, Error | null>;
}
