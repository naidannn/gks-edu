<script setup lang="ts">
/**
 * "Нууц үгээ мартсан" — step one. The API answers 202 whether or not the
 * address is registered, and so does this page: the success panel never says
 * "и-мэйл олдлоо", only "хэрэв бүртгэлтэй бол илгээлээ".
 */
definePageMeta({ layout: 'default' });
useHead({ title: 'Нууц үг сэргээх' });
useNoIndex();

const api = useApi();

const email = ref('');
const sent = ref(false);
const error = ref<string | null>(null);
const pending = ref(false);

async function submit() {
  error.value = null;
  pending.value = true;
  try {
    await api.post('/auth/password/forgot', { email: email.value.trim().toLowerCase() });
    sent.value = true;
  } catch (err) {
    error.value = apiErrorMessage(err, 'Хүсэлт илгээхэд алдаа гарлаа. Дараа дахин оролдоно уу.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="gks-auth">
    <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-auth__mark">

    <template v-if="sent">
      <h1 class="gks-auth__title">Имэйлээ шалгана уу</h1>
      <p class="gks-auth__lede">
        Хэрэв <strong>{{ email }}</strong> хаягаар бүртгэл байгаа бол нууц үг сэргээх холбоос
        илгээгдлээ. Холбоос 1 цаг хүчинтэй.
      </p>
      <p class="gks-auth__note">
        Имэйл ирэхгүй бол спам хавтсаа шалгаарай. Тэгсэн ч олдохгүй бол 7710-9000 руу залгана уу.
      </p>
      <p class="gks-auth__switch">
        <NuxtLink to="/login">Нэвтрэх хуудас руу буцах</NuxtLink>
      </p>
    </template>

    <template v-else>
      <h1 class="gks-auth__title">Нууц үгээ сэргээх</h1>
      <p class="gks-auth__lede">
        Бүртгэлтэй имэйл хаягаа оруулна уу. Шинэ нууц үг тохируулах холбоосыг тийш нь илгээнэ.
      </p>

      <form class="gks-auth__form" @submit.prevent="submit">
        <DsInput v-model="email" type="email" label="И-мэйл" required autocomplete="email" />

        <p v-if="error" class="gks-auth__error">{{ error }}</p>

        <DsButton type="submit" variant="accent" block :disabled="pending" :loading="pending">
          {{ pending ? 'Илгээж байна…' : 'Холбоос илгээх' }}
        </DsButton>
      </form>

      <p class="gks-auth__switch">
        Нууц үгээ санасан уу?
        <NuxtLink to="/login">Нэвтрэх</NuxtLink>
      </p>
    </template>
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
.gks-auth__lede {
  margin-top: var(--sp-2);
  max-width: 420px;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}
.gks-auth__note {
  margin-top: var(--sp-4);
  max-width: 420px;
  font-size: var(--fs-body-sm);
  color: var(--text-muted);
}

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

.gks-auth__switch { margin-top: var(--sp-5); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-auth__switch a { color: var(--brand-600); text-decoration: underline; text-underline-offset: 3px; }
</style>
