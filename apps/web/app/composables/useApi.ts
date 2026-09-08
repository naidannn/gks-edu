import type { ApiErrorBody } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
import { ApiError } from '~/utils/api-error';

type RequestOptions = Parameters<typeof $fetch>[1];
type RequestBody = NonNullable<RequestOptions>['body'];

/**
 * `$fetch` bound to the NestJS API: attaches the bearer token, retries once
 * after a silent refresh on 401, and normalises errors into `ApiError`.
 */
export function useApi() {
  const config = useRuntimeConfig();
  const auth = useAuthStore();

  const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
    // `$fetch` widens the result to `TypedInternalResponse`, which TS cannot
    // prove equals the caller's `T`; the API's own types are the contract here.
    const send = (token: string | null): Promise<T> =>
      $fetch<T>(path, {
        baseURL: config.public.apiBase,
        ...options,
        headers: {
          ...(options?.headers as Record<string, string> | undefined),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }) as Promise<T>;

    const presented = auth.accessToken;

    try {
      return await send(presented);
    } catch (error) {
      const status = (error as { statusCode?: number; response?: { status?: number } }).statusCode
        ?? (error as { response?: { status?: number } }).response?.status
        ?? 0;

      if (status === 401 && auth.refreshToken) {
        // A slow request can come back 401 holding a token that has already
        // been replaced — retry with the current one rather than rotating
        // again. `auth.refresh()` itself is single-flight, so parallel callers
        // that do need one share the same round trip.
        const refreshed = auth.accessToken !== presented || (await auth.refresh());
        if (refreshed) {
          return send(auth.accessToken);
        }
      }

      const body = (error as { data?: ApiErrorBody }).data;
      // The API answers in Mongolian, so a server-supplied message is shown
      // verbatim. When there is no reply at all — API down, CORS, a dev-server
      // restart mid-request — `$fetch` supplies its own English text with the
      // URL in it; that is a log line, not something to put in front of staff.
      const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : (body?.message ?? 'Сервертэй холбогдож чадсангүй');

      throw new ApiError(status, body, message, { cause: error });
    }
  };

  return {
    request,
    get: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),
    put: <T>(path: string, body?: RequestBody, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'PUT', body }),
    delete: <T>(path: string, options?: RequestOptions) =>
      request<T>(path, { ...options, method: 'DELETE' }),
  };
}
