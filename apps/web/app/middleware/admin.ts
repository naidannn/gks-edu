import { useAuthStore } from '~/stores/auth';

/**
 * Route guard for the admin-only screens (settings, staff, content).
 *
 * An anonymous visitor is sent to the login with a return path, exactly as
 * `staff` and `doc-staff` do — a 403 error page for somebody who simply is not
 * signed in yet is a dead end, and the commonest way to reach one of these
 * URLs is a bookmark opened in a session that has expired.
 */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  if (import.meta.server) return;

  if (!auth.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
  }
  if (!auth.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Зөвхөн админы хандах хэсэг' });
  }
});
