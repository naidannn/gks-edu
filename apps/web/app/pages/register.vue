<script setup lang="ts">
import { registerSchema } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Creating a portal account. It carries only the login itself. The identity the
 * brokerage contract is written against (`/app/profile`, 1B-18) is asked for at
 * the point it is actually needed — starting a service — not on the way in.
 */
definePageMeta({ layout: 'default' });
useHead({ title: 'Бүртгүүлэх' });
useNoIndex();

const auth = useAuthStore();
const route = useRoute();
const meta = useMetaTracking();

/** Without a client id there is no Google column at all — divider included. */
const googleEnabled = Boolean(useRuntimeConfig().public.googleClientId);

const name = ref('');
const email = ref('');
const password = ref('');
const passwordRepeat = ref('');
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;

  if (password.value !== passwordRepeat.value) {
    error.value = 'Нууц үг хоорондоо таарахгүй байна';
    return;
  }

  const parsed = registerSchema.safeParse({
    email: email.value,
    password: password.value,
    name: name.value.trim() || undefined,
  });
  if (!parsed.success) {
    error.value = 'И-мэйлээ шалгана уу. Нууц үг дор хаяж 8 тэмдэгт байна.';
    return;
  }

  pending.value = true;
  // Minted before the request, so the pixel's `CompleteRegistration` and the
  // one the API fires when the row is written share an id (1A-38).
  const eventId = meta.newEventId();
  try {
    await auth.register(parsed.data.email, parsed.data.password, parsed.data.name, trackingPayload(eventId));
    meta.trackPaired('CompleteRegistration', eventId, { content_name: 'Бүртгэл' });
    // Into the cabinet, not a form: a new account has nothing to declare yet.
    await navigateTo((route.query.redirect as string) || '/app/cases');
  } catch (err) {
    error.value = apiErrorMessage(err, 'Бүртгэл үүсгэхэд алдаа гарлаа');
  } finally {
    pending.value = false;
  }
}

/**
 * Google covers registration too: an unknown address creates the account, a
 * known one just signs in. Either way it lands in the same place.
 *
 * Nothing is tracked here on purpose: the browser cannot know which of the two
 * just happened, and firing `CompleteRegistration` for every Google click
 * would count returning users as new ones. The API knows — it reports the
 * conversion only on the branch that actually creates a row (1A-38) — so all
 * that travels from here is the click context it needs to match the person.
 */
async function submitGoogle(idToken: string) {
  error.value = null;
  pending.value = true;
  try {
    await auth.loginWithGoogle(idToken, trackingPayload(meta.newEventId()));
    await navigateTo((route.query.redirect as string) || '/app/cases');
  } catch (err) {
    error.value = apiErrorMessage(err, 'Google-ээр бүртгүүлж чадсангүй');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="gks-auth">
    <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-auth__mark">
    <h1 class="gks-auth__title">Бүртгүүлэх</h1>
    <p class="gks-auth__lede">Солонгост суралцах замаа GKS EDU-тэй хамт эхлүүлээрэй.</p>

    <form class="gks-auth__form" @submit.prevent="submit">
      <DsInput v-model="name" label="Нэр" autocomplete="name" placeholder="Батбаярын Түвшин" />
      <DsInput v-model="email" type="email" label="И-мэйл" required autocomplete="email" />
      <DsInput
        v-model="password"
        type="password"
        label="Нууц үг"
        required
        autocomplete="new-password"
        hint="Дор хаяж 8 тэмдэгт"
      />
      <DsInput v-model="passwordRepeat" type="password" label="Нууц үг давтах" required autocomplete="new-password" />

      <p v-if="error" class="gks-auth__error">{{ error }}</p>

      <DsButton type="submit" variant="accent" block :disabled="pending" :loading="pending">
        {{ pending ? 'Түр хүлээнэ үү…' : 'Бүртгүүлэх' }}
      </DsButton>

      <!--
        Consent is stated, not ticked. A checkbox in front of the button only
        adds a click: the two documents are one tap away either way, and a
        mandatory box nobody can decline is not a choice, it is friction.
      -->
      <p class="gks-auth__consent">
        Бүртгүүлснээр та
        <NuxtLink to="/terms">Үйлчилгээний нөхцөл</NuxtLink>,
        <NuxtLink to="/privacy">Нууцлалын бодлого</NuxtLink>-той танилцаж,
        зөвшөөрсөнд тооцно.
      </p>
    </form>

    <div v-if="googleEnabled" class="gks-auth__alt">
      <p class="gks-auth__divider"><span>эсвэл</span></p>
      <AuthGoogleButton text="signup_with" @credential="submitGoogle" />
    </div>

    <p class="gks-auth__switch">
      Аль хэдийн бүртгэлтэй юу?
      <NuxtLink :to="{ path: '/login', query: route.query }">Нэвтрэх</NuxtLink>
    </p>
  </section>
</template>

<style scoped>
.gks-auth {
  max-width: var(--container-narrow);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.gks-auth__mark { height: 40px; width: auto; margin-bottom: var(--sp-6); }
.gks-auth__title { font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-auth__lede { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-auth__form {
  margin-top: var(--sp-6);
  width: 100%;
  max-width: 360px;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  text-align: left;
}

.gks-auth__error {
  border: var(--border-hair) solid var(--danger-line);
  background: var(--danger-bg);
  color: var(--danger-fg);
  border-radius: var(--radius-1);
  padding: var(--sp-3) var(--sp-4);
  font-size: var(--fs-body-sm);
}

.gks-auth__alt {
  margin-top: var(--sp-5);
  width: 100%;
  max-width: 360px;
}

.gks-auth__divider {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}
.gks-auth__divider::before,
.gks-auth__divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--line-hairline);
}

.gks-auth__consent {
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
  color: var(--text-subtle);
  text-align: center;
}
.gks-auth__consent a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }

.gks-auth__switch { margin-top: var(--sp-5); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-auth__switch a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }
</style>
