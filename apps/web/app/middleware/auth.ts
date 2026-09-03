import { useAuthStore } from '~/stores/auth';

/** Route guard: `definePageMeta({ middleware: 'auth' })`. */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();

  // Tokens only exist client-side, so SSR cannot decide this.
  if (import.meta.server) return;

  if (!auth.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
  }
});
