import { useAuthStore } from '~/stores/auth';

/** Restores the persisted session once, before the app renders on the client. */
export default defineNuxtPlugin(async () => {
  await useAuthStore().restore();
});
