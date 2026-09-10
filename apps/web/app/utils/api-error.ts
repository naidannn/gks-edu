import type { ApiErrorBody } from '@gks/shared';

/**
 * A failed API call, with the server's own reply kept intact.
 *
 * Lives here rather than beside `useApi()` because it is a plain class that
 * anything may catch, and because {@link apiErrorMessage} — the only thing most
 * callers want from it — has to be usable without pulling in a composable.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | undefined,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

/**
 * What to show a person when a request failed.
 *
 * The API answers in Mongolian, so a server-supplied message is shown verbatim
 * — including Nest's `ValidationPipe`, which replies with an array of field
 * errors rather than a string. Anything else gets the caller's fallback: a
 * `TypeError` from a bug, or `$fetch`'s own English "Failed to fetch … <url>"
 * when the API never answered at all, is a log line and not something to put in
 * front of staff.
 *
 * Two failure shapes reach this. `useApi()` has already normalised its own into
 * an {@link ApiError}; `useFetch` and a bare `$fetch` hand back the raw error
 * with the parsed body on `.data`. Reading only the second was a quiet bug:
 * every screen that fetched through `useApi()` — changing a password, asking
 * for a reset link — swallowed the server's reason and showed its fallback.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;

  const body = (error as { data?: ApiErrorBody } | null | undefined)?.data;
  if (Array.isArray(body?.message)) return body.message.join(', ');
  return body?.message || fallback;
}

/**
 * The HTTP status behind a failure, when there is one.
 *
 * Two failure shapes reach this, as above: `useApi()`'s {@link ApiError}, and
 * `useFetch`/`$fetch`'s `FetchError`, which carries `statusCode`. `null` means
 * the request never got an answer — a timeout, a DNS failure, the API down —
 * and that is emphatically not a 404. A page that treats every failure as
 * "not found" tells a visitor the school does not exist because the network
 * blinked, and tells a crawler the URL is gone.
 */
export function apiErrorStatus(error: unknown): number | null {
  if (error instanceof ApiError) return error.status;
  const raw = error as
    | { statusCode?: unknown; status?: unknown; response?: { status?: unknown } }
    | null
    | undefined;
  const candidate = raw?.statusCode ?? raw?.status ?? raw?.response?.status;
  return typeof candidate === 'number' ? candidate : null;
}
