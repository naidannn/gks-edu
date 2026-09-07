import { useAuthStore } from '~/stores/auth';

/** Route guard for the paperwork screens: admins, consultants and document officers (1D-16). */
export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore();
  if (import.meta.server) return;

  if (!auth.isAuthenticated) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`);
  }
  if (!auth.isDocStaff) {
    throw createError({ statusCode: 403, statusMessage: 'Зөвхөн ажилтны хандах хэсэг' });
  }
});
