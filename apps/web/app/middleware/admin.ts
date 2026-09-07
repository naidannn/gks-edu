import { useAuthStore } from '~/stores/auth';

export default defineNuxtRouteMiddleware(() => {
  const auth = useAuthStore();
  if (import.meta.server) return;

  if (!auth.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Зөвхөн админы хандах хэсэг' });
  }
});
