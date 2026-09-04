import type { ApiErrorBody } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

type RequestOptions = Parameters<typeof $fetch>[1];
type RequestBody = NonNullable<RequestOptions>['body'];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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

    try {
      return await send(auth.accessToken);
    } catch (error) {
      const status = (error as { statusCode?: number; response?: { status?: number } }).statusCode
        ?? (error as { response?: { status?: number } }).response?.status
        ?? 0;

      if (status === 401 && auth.refreshToken) {
        const refreshed = await auth.refresh();
        if (refreshed) {
          return send(auth.accessToken);
        }
      }

      const body = (error as { data?: ApiErrorBody }).data;
      const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : (body?.message ?? (error as Error).message);

      throw new ApiError(status, body, message);
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
