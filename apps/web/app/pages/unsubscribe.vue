<script setup lang="ts">
/**
 * 1O — the way out of the mailing list.
 *
 * The token in the link is an HMAC of the address, so the page needs no login
 * and holds no session: somebody who unsubscribes has already decided, and
 * asking them to sign in first is how an unsubscribe turns into a spam report.
 *
 * It does *not* unsubscribe on load. A mail client that pre-fetches links
 * would otherwise unsubscribe people who only opened the email — one press of
 * the button is the confirmation, and it is one press.
 */
definePageMeta({ layout: 'default' });
useNoIndex();
useHead({ title: 'Захиалгаас гарах — GKSedu.mn' });

const route = useRoute();
const api = useApi();

const token = computed(() => String(route.query.token ?? ''));
const done = ref(false);
const email = ref<string | null>(null);
const pending = ref(false);
const errorMsg = ref<string | null>(null);

async function unsubscribe() {
  if (!token.value) {
    errorMsg.value = 'Холбоос бүрэн биш байна.';
    return;
  }
  pending.value = true;
  errorMsg.value = null;
  try {
    const result = await api.post<{ email: string }>('/marketing/unsubscribe', { token: token.value });
    email.value = result.email;
    done.value = true;
  } catch (error) {
    errorMsg.value = apiErrorMessage(error, 'Хүсэлтийг гүйцэтгэж чадсангүй');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="gks-unsub">
    <DsCard class="gks-unsub__card">
      <template v-if="done">
        <h1 class="gks-unsub__title">Захиалга цуцлагдлаа</h1>
        <p class="gks-unsub__text">
          <strong>{{ email }}</strong> хаяг руу цаашид мэдээллийн захидал илгээхгүй.
        </p>
        <p class="gks-unsub__note">
          Үйлчилгээтэй тань холбоотой чухал мэдэгдэл (төлбөр, материал, виз) энэ тохиргооноос
          үл хамааран ирсээр байх болно.
        </p>
        <DsButton variant="secondary" @click="navigateTo('/')">Нүүр хуудас руу</DsButton>
      </template>

      <template v-else>
        <h1 class="gks-unsub__title">Мэдээллийн захидлаас гарах</h1>
        <p class="gks-unsub__text">
          Та GKS EDU-ийн мэдээллийн захидал хүлээн авахаа болих гэж байна.
        </p>
        <p v-if="errorMsg" class="gks-unsub__error">{{ errorMsg }}</p>
        <div class="gks-unsub__actions">
          <DsButton variant="accent" :disabled="pending || !token" @click="unsubscribe">
            {{ pending ? 'Түр хүлээнэ үү…' : 'Тийм, гарах' }}
          </DsButton>
          <DsButton variant="secondary" @click="navigateTo('/')">Болих</DsButton>
        </div>
      </template>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-unsub {
  display: flex;
  justify-content: center;
  padding: var(--sp-8) var(--sp-4);
}
.gks-unsub__card { max-width: 520px; width: 100%; }
.gks-unsub__title { font-size: var(--fs-h3); font-weight: var(--fw-bold); margin-bottom: var(--sp-3); }
.gks-unsub__text { font-size: var(--fs-body); color: var(--text-body); margin-bottom: var(--sp-3); }
.gks-unsub__note { font-size: var(--fs-body-sm); color: var(--text-subtle); margin-bottom: var(--sp-4); }
.gks-unsub__error { color: var(--danger-fg); font-size: var(--fs-body-sm); margin-bottom: var(--sp-3); }
.gks-unsub__actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; }
</style>
