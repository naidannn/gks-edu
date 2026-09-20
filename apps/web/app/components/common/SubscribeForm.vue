<script setup lang="ts">
/**
 * The newsletter box in the site footer (1O).
 *
 * One field. A visitor who is willing to hear from us later is not willing to
 * fill in a form to say so, and every extra field is somebody who does not
 * finish. The name we already have for anybody who matters; the address is the
 * whole point.
 *
 * Signing up twice is a success, not an error: the API is idempotent, so a
 * person who forgot they had subscribed sees the same thank-you.
 */
const api = useApi();
const route = useRoute();

const email = ref('');
const pending = ref(false);
const done = ref(false);
const errorMsg = ref<string | null>(null);

async function submit() {
  if (!email.value.includes('@')) {
    errorMsg.value = 'Имэйл хаягаа шалгана уу.';
    return;
  }

  pending.value = true;
  errorMsg.value = null;
  try {
    await api.post('/marketing/subscribe', {
      email: email.value.trim(),
      // Where they were standing when they signed up — the same attribution
      // the lead form carries, so a campaign can be traced to the page that
      // earned it.
      utm: {
        ...(route.query.utm_source ? { utm_source: String(route.query.utm_source) } : {}),
        ...(route.query.utm_medium ? { utm_medium: String(route.query.utm_medium) } : {}),
        ...(route.query.utm_campaign ? { utm_campaign: String(route.query.utm_campaign) } : {}),
        landing: route.path,
      },
    });
    done.value = true;
    email.value = '';
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Бүртгэж чадсангүй. Дахин оролдоно уу.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="gks-subscribe">
    <h2 class="gks-subscribe__title">Мэдээлэл авах</h2>

    <p v-if="done" class="gks-subscribe__done">
      Баярлалаа — элсэлт, тэтгэлгийн мэдээллийг имэйлээр хүргэнэ.
    </p>

    <template v-else>
      <p class="gks-subscribe__hint">
        Элсэлтийн хугацаа, GKS тэтгэлгийн мэдээллийг сард нэг удаа.
      </p>
      <form class="gks-subscribe__form" @submit.prevent="submit">
        <input
          v-model="email"
          type="email"
          class="gks-subscribe__input"
          placeholder="tany@imeil.mn"
          aria-label="Имэйл хаяг"
          autocomplete="email"
          required
        >
        <button type="submit" class="gks-subscribe__button" :disabled="pending">
          {{ pending ? '…' : 'Бүртгүүлэх' }}
        </button>
      </form>
      <p v-if="errorMsg" class="gks-subscribe__error">{{ errorMsg }}</p>
    </template>
  </div>
</template>

<style scoped>
/* The footer is a dark band, so this styles itself rather than borrowing the
   light-surface form controls from the design system. */
.gks-subscribe { display: flex; flex-direction: column; gap: var(--sp-2); }
/* The footer's own column heading is a scoped rule in `default.vue`, and a
   parent's scoped CSS does not reach inside a child component — so the
   heading carries the same type here rather than borrowing the class. */
.gks-subscribe__title {
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--brand-300);
}
.gks-subscribe__hint { font-size: var(--fs-micro); line-height: var(--lh-body); color: var(--n-400); }
.gks-subscribe__form { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
.gks-subscribe__input {
  flex: 1 1 180px;
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--radius-1);
  border: 1px solid rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 8%);
  color: #fff;
  font-size: var(--fs-body-sm);
}
.gks-subscribe__input::placeholder { color: rgb(255 255 255 / 45%); }
.gks-subscribe__input:focus-visible { outline: 2px solid var(--brand-400); outline-offset: 1px; }
.gks-subscribe__button {
  padding: 10px 16px;
  border: 0;
  border-radius: var(--radius-1);
  background: var(--brand-500);
  color: #fff;
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.gks-subscribe__button:disabled { opacity: .6; cursor: default; }
.gks-subscribe__done { font-size: var(--fs-body-sm); color: #8fd6ab; }
.gks-subscribe__error { font-size: var(--fs-micro); color: #f2a2a5; }
</style>
