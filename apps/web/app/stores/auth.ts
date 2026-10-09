import type { AuthSession, MetaTracking, User } from '@gks/shared';
import { defineStore } from 'pinia';
import { browserLock, refreshAcrossTabs, tokenSubject } from '~/utils/shared-refresh';
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
  /**
   * Where a signed-in person starts. A document officer is staff but not CRM
   * staff — `/admin` itself 403s them — so their start is the materials queue;
   * sending them to `/app` dropped them in an empty client cabinet.
   */
  const homePath = computed(() =>
    isStaff.value ? '/admin' : isDocStaff.value ? '/admin/documents' : '/app',
  );

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
   * Returns false when the session could not be renewed. The tokens are torn
   * down only when the API actually refused them — an outage or a deploy
   * restarting the API leaves them in place for the next attempt.
   *
   * Single-flight within the tab, and locked across tabs: the API rotates
   * refresh tokens and revokes every session when a spent one comes back, so
   * no two callers — here or in another tab — may present the same token. See
   * {@link singleFlight} and {@link refreshAcrossTabs}.
   */
  const refresh = singleFlight(async (): Promise<boolean> => {
    const presented = refreshToken.value;
    if (!presented) return false;

    const outcome = await refreshAcrossTabs({
      presented,
      readStored: () => localStorage.getItem(REFRESH_KEY),
      exchange: (token) =>
        $fetch<AuthSession>('/auth/refresh', {
          baseURL: config.public.apiBase,
          method: 'POST',
          body: { refreshToken: token },
        }),
      withLock: browserLock('gks.auth.refresh'),
    });

    switch (outcome.kind) {
      case 'renewed':
        apply(outcome.session);
        return true;
      case 'superseded':
        accessToken.value = localStorage.getItem(ACCESS_KEY);
        refreshToken.value = outcome.refreshToken;
        return true;
      case 'signed-out':
        clear();
        return false;
      case 'rejected':
        // Only tear the session down if it is still the one that just failed.
        if (refreshToken.value === presented) clear();
        return false;
      case 'unavailable':
        return false;
    }
  });

  /**
   * Another tab renewed, signed in or signed out: follow it. Without this a
   * tab keeps presenting the refresh token it read at load time, long after
   * another tab has spent it.
   */
  if (import.meta.client) {
    window.addEventListener('storage', (event) => {
      if (event.key !== ACCESS_KEY && event.key !== REFRESH_KEY && event.key !== null) return;

      const nextAccess = localStorage.getItem(ACCESS_KEY);
      const nextRefresh = localStorage.getItem(REFRESH_KEY);
      if (!nextAccess || !nextRefresh) {
        accessToken.value = null;
        refreshToken.value = null;
        user.value = null;
        return;
      }

      const switched = tokenSubject(nextAccess) !== (user.value?.id ?? null);
      accessToken.value = nextAccess;
      refreshToken.value = nextRefresh;
      if (switched) {
        void $fetch<User>('/users/me', {
          baseURL: config.public.apiBase,
          headers: { Authorization: `Bearer ${nextAccess}` },
        })
          .then((me) => (user.value = me))
          .catch(() => undefined);
      }
    });
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
        // A refused token is already cleared by `refresh`; an unreachable API
        // is no reason to forget a session that may still be good.
        if (!refreshToken.value) clear();
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
    homePath,
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
