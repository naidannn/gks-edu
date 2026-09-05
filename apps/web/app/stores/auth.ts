import type { AuthSession, User } from '@gks/shared';
import { defineStore } from 'pinia';

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

  async function register(email: string, password: string, name?: string): Promise<void> {
    const session = await $fetch<AuthSession>('/auth/register', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { email, password, name },
    });
    apply(session);
  }

  /**
   * `idToken` is the credential Google Identity Services hands the browser; the
   * API verifies it and either links it to the matching account or creates one.
   */
  async function loginWithGoogle(idToken: string): Promise<void> {
    const session = await $fetch<AuthSession>('/auth/google', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: { idToken },
    });
    apply(session);
  }

  /** Returns false when the refresh token is gone or rejected. */
  async function refresh(): Promise<boolean> {
    if (!refreshToken.value) return false;

    try {
      const session = await $fetch<AuthSession>('/auth/refresh', {
        baseURL: config.public.apiBase,
        method: 'POST',
        body: { refreshToken: refreshToken.value },
      });
      apply(session);
      return true;
    } catch {
      clear();
      return false;
    }
  }

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
