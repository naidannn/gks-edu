import { useAuthStore } from '~/stores/auth';

/** Route guard for the CRM: admins and consultants (0-07, 1B). */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  if (import.meta.server) return;

  if (!auth.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
  }
  if (!auth.isStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Зөвхөн ажилтны хандах хэсэг' });
  }
});
