<script setup lang="ts">
import { loginSchema } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/** Sign in. New accounts are created on `/register`. */
definePageMeta({ layout: 'default' });
useHead({ title: 'Нэвтрэх' });
useNoIndex();

const auth = useAuthStore();
const route = useRoute();

/** Without a client id there is no Google column at all — divider included. */
const googleEnabled = Boolean(useRuntimeConfig().public.googleClientId);

const email = ref('');
const password = ref('');
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;

  const parsed = loginSchema.safeParse({ email: email.value, password: password.value });
  if (!parsed.success) {
    error.value = 'И-мэйл болон нууц үгээ шалгана уу (нууц үг дор хаяж 8 тэмдэгт).';
    return;
  }

  pending.value = true;
  try {
    await auth.login(parsed.data.email, parsed.data.password);
    // An explicit redirect (bounced off a guarded page) wins; otherwise staff
    // land in the CRM and clients in their own cabinet.
    await navigateTo((route.query.redirect as string) || (auth.isStaff ? '/admin' : '/app'));
  } catch (err) {
    error.value = apiErrorMessage(err, 'И-мэйл эсвэл нууц үг буруу байна');
  } finally {
    pending.value = false;
  }
}

/** The Google button hands us a verified ID token; the API turns it into a session. */
async function submitGoogle(idToken: string) {
  error.value = null;
  pending.value = true;
  try {
    // A Google sign-in from here creates the account when the address is new,
    // which the API reports as a `CompleteRegistration`; the click context has
    // to travel with it or that conversion matches nobody (1A-38).
    await auth.loginWithGoogle(idToken, trackingPayload(newEventId()));
    await navigateTo((route.query.redirect as string) || (auth.isStaff ? '/admin' : '/app'));
  } catch (err) {
    error.value = apiErrorMessage(err, 'Google-ээр нэвтэрч чадсангүй');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="gks-auth">
    <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-auth__mark">
    <h1 class="gks-auth__title">Нэвтрэх</h1>
    <p class="gks-auth__lede">Гэрээ, төлбөр, материалын явцаа нэг дороос хянана.</p>

    <form class="gks-auth__form" @submit.prevent="submit">
      <DsInput v-model="email" type="email" label="И-мэйл" required autocomplete="email" />
      <DsInput v-model="password" type="password" label="Нууц үг" required autocomplete="current-password" />

      <NuxtLink to="/forgot-password" class="gks-auth__forgot">Нууц үгээ мартсан уу?</NuxtLink>

      <p v-if="error" class="gks-auth__error">{{ error }}</p>

      <DsButton type="submit" variant="accent" block :disabled="pending" :loading="pending">
        {{ pending ? 'Түр хүлээнэ үү…' : 'Нэвтрэх' }}
      </DsButton>
    </form>

    <div v-if="googleEnabled" class="gks-auth__alt">
      <p class="gks-auth__divider"><span>эсвэл</span></p>
      <AuthGoogleButton text="signin_with" @credential="submitGoogle" />
    </div>

    <p class="gks-auth__switch">
      Бүртгэлгүй юу?
      <NuxtLink :to="{ path: '/register', query: route.query }">Шинэ бүртгэл үүсгэх</NuxtLink>
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

.gks-auth__forgot {
  margin-top: calc(var(--sp-2) * -1);
  align-self: flex-end;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.gks-auth__forgot:hover { color: var(--brand-600); }

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

.gks-auth__switch { margin-top: var(--sp-5); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-auth__switch a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }
</style>
