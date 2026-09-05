<script setup lang="ts">
/**
 * Google's own sign-in button. It is rendered by Google into a closed iframe,
 * so its look is fixed by their branding rules — width and caption are the only
 * things we get to set. Emits the ID token; what to do with it is the page's
 * business.
 *
 * Renders nothing when `NUXT_PUBLIC_GOOGLE_CLIENT_ID` is unset, which keeps the
 * email/password form the whole login page on a deployment without OAuth.
 */
const props = withDefaults(defineProps<{ text?: GoogleButtonOptions['text'] }>(), {
  text: 'signin_with',
});

const emit = defineEmits<{ credential: [idToken: string] }>();

const config = useRuntimeConfig();
const clientId = config.public.googleClientId;

const container = ref<HTMLElement | null>(null);
const failed = ref(false);

onMounted(async () => {
  if (!clientId || !container.value) return;

  try {
    await loadGoogleIdentityServices();
  } catch {
    failed.value = true;
    return;
  }

  const gsi = window.google?.accounts.id;
  if (!gsi || !container.value) return;

  gsi.initialize({
    client_id: clientId,
    callback: ({ credential }) => emit('credential', credential),
    // No One Tap here, so silent re-selection would only surprise people.
    auto_select: false,
    ux_mode: 'popup',
  });

  gsi.renderButton(container.value, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    logo_alignment: 'center',
    text: props.text,
    // Google caps the button at 400px and needs a number, not a CSS length.
    width: Math.min(400, Math.round(container.value.clientWidth) || 360),
  });
});
</script>

<template>
  <div v-if="clientId" class="gks-google">
    <div ref="container" class="gks-google__button" />
    <p v-if="failed" class="gks-google__error">
      Google-ийн үйлчилгээ ачаалагдсангүй. И-мэйлээрээ нэвтэрнэ үү.
    </p>
  </div>
</template>

<style scoped>
.gks-google {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
}

/* Google sizes the iframe itself; this only keeps it centred in the column. */
.gks-google__button {
  width: 100%;
  display: flex;
  justify-content: center;
  min-height: 40px;
}

.gks-google__error {
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  text-align: center;
}
</style>
