import type { AuthSession, MetaTracking, User } from '@gks/shared';
import { defineStore } from 'pinia';
import { singleFlight } from '~/utils/single-flight';

const ACCESS_KEY = 'gks.accessToken';
const REFRESH_KEY = 'gks.refreshToken';

export const useAuthStore = defineStore('auth', () => {
  const config = useRuntimeConfig();

  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(null);
  const refreshToken = ref<string | null>(null);

  const isAuthenticated = computed(() => Boolean(accessToken.value && user.value));
  const isAdmin = computed(() => user.value?.role === 'ADMIN');
  /** CRM access: admins and consultants (0-07, 1B). */
  const isStaff = computed(() => user.value?.role === 'ADMIN' || user.value?.role === 'CONSULTANT');
  /** Paperwork access: the document officer works materials but not the CRM (ARCHITECTURE.md §11). */
  const isDocStaff = computed(() => isStaff.value || user.value?.role === 'DOC_OFFICER');

  /** Tokens live in localStorage, so this is a no-op during SSR. */
  function persist(): void {
    if (import.meta.server) return;
    if (accessToken.value) localStorage.setItem(ACCESS_KEY, accessToken.value);
    else localStorage.removeItem(ACCESS_KEY);
    if (refreshToken.value) localStorage.setItem(REFRESH_KEY, refreshToken.value);
    else localStorage.removeItem(REFRESH_KEY);
  }

  function apply(session: AuthSession): void {
    accessToken.value = session.accessToken;
    refreshToken.value = session.refreshToken;
    user.value = session.user;
    persist();
  }

  function clear(): void {
    accessToken.value = null;
    refreshToken.value = null;
    user.value = null;
    persist();
  }

  async function login(email: string, password: string): Promise<void> {
    const session = await $fetch<AuthSession>('/auth/login', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { email, password },
    });
    apply(session);
  }

  /**
   * `tracking` is the Meta ad-click context (1A-38) — it exists so the
   * server-side `CompleteRegistration` carries the click and deduplicates
   * against the pixel's. Optional: a registration must work with it absent.
   */
  async function register(
    email: string,
    password: string,
    name?: string,
    tracking?: MetaTracking,
  ): Promise<void> {
    const session = await $fetch<AuthSession>('/auth/register', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { email, password, name, tracking },
    });
    apply(session);
  }

  /**
   * `idToken` is the credential Google Identity Services hands the browser; the
   * API verifies it and either links it to the matching account or creates one.
   */
  async function loginWithGoogle(idToken: string, tracking?: MetaTracking): Promise<void> {
    const session = await $fetch<AuthSession>('/auth/google', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { idToken, tracking },
    });
    apply(session);
  }

  /**
   * Returns false when the refresh token is gone or rejected.
   *
   * Single-flight: the API rotates refresh tokens, so parallel callers must
   * share one round trip rather than each burn the same token — see
   * {@link singleFlight}.
   */
  const refresh = singleFlight(async (): Promise<boolean> => {
    const presented = refreshToken.value;
    if (!presented) return false;

    try {
      const session = await $fetch<AuthSession>('/auth/refresh', {
        baseURL: config.public.apiBase,
        method: 'POST',
        body: { refreshToken: presented },
      });
      apply(session);
      return true;
    } catch {
      // Only tear the session down if it is still the one that just failed.
      // A refresh that lost a race must not wipe the tokens the winner stored.
      if (refreshToken.value === presented) clear();
      return false;
    }
  });

  async function logout(): Promise<void> {
    const token = refreshToken.value;
    clear();

    if (token) {
      await $fetch('/auth/logout', {
        baseURL: config.public.apiBase,
        method: 'POST',
        body: { refreshToken: token },
      }).catch(() => undefined);
    }
  }

  /** Rehydrates from localStorage and verifies the session on the client. */
  async function restore(): Promise<void> {
    if (import.meta.server) return;

    accessToken.value = localStorage.getItem(ACCESS_KEY);
    refreshToken.value = localStorage.getItem(REFRESH_KEY);
    if (!accessToken.value) return;

    try {
      user.value = await $fetch<User>('/users/me', {
        baseURL: config.public.apiBase,
        headers: { Authorization: `Bearer ${accessToken.value}` },
      });
    } catch {
      if (!(await refresh())) {
        clear();
        return;
      }

      user.value = await $fetch<User>('/users/me', {
        baseURL: config.public.apiBase,
        headers: { Authorization: `Bearer ${accessToken.value}` },
      }).catch(() => null);
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    isAuthenticated,
    isAdmin,
    isStaff,
    isDocStaff,
    apply,
    login,
    register,
    loginWithGoogle,
    refresh,
    logout,
    restore,
    clear,
  };
});
