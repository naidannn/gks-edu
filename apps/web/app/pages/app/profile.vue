<script setup lang="ts">
import type { MyProfileResponse } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import { emptyClientForm, fillFromClient, myProfilePayload, validateMyProfileForm } from '~/utils/client-form';

/**
 * The client filling in their own record (1B-18) — the same fields the office
 * form collects, because the brokerage contract is written from them (§6.2).
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });
useHead({ title: 'Миний мэдээлэл' });

const api = useApi();
const { refresh } = usePortal();
const catalogue = useUniversityCatalogue();

const form = reactive(emptyClientForm());
const errors = reactive<Record<string, string>>({});
const profile = ref<MyProfileResponse | null>(null);
const loading = ref(true);
const saving = ref(false);
const savedAt = ref<Date | null>(null);
const errorMsg = ref<string | null>(null);

onMounted(async () => {
  catalogue.load();
  try {
    profile.value = await api.get<MyProfileResponse>('/me/profile');
    if (profile.value.client) {
      fillFromClient(form, profile.value.client);
    } else {
      // A fresh account still knows the name and email it registered with.
      form.email = profile.value.account.email ?? '';
      form.phone = profile.value.account.phone ?? '';
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Мэдээллийг ачаалж чадсангүй';
  } finally {
    loading.value = false;
  }
});

async function save() {
  errorMsg.value = null;
  savedAt.value = null;
  if (!validateMyProfileForm(form, errors)) {
    errorMsg.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу';
    return;
  }

  saving.value = true;
  try {
    profile.value = {
      ...(profile.value as MyProfileResponse),
      ...(await api.put<Omit<MyProfileResponse, 'account'>>('/me/profile', myProfilePayload(form))),
    };
    savedAt.value = new Date();
    await refresh();
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.message : 'Хадгалж чадсангүй';
  } finally {
    saving.value = false;
  }
}

const completeness = computed(() => profile.value?.completeness ?? null);
</script>

<template>
  <div class="gks-profile">
    <header class="gks-profile__head">
      <div>
        <span class="gks-eyebrow">Миний булан</span>
        <h1 class="gks-profile__title">Миний мэдээлэл</h1>
        <p class="gks-profile__lede">
          Зуучлалын гэрээ, сургуулийн мэдүүлэг, виз — бүгд эдгээр мэдээлэл дээр үндэслэнэ.
          Алдаатай бичсэн зүйл байвал энд засаж болно.
        </p>
      </div>
      <DsBadge v-if="profile?.client" tone="neutral">{{ profile.client.code }}</DsBadge>
    </header>

    <div v-if="loading" class="gks-profile__skeleton" />

    <template v-else>
      <DsCard v-if="completeness && !completeness.isComplete" accent>
        <p class="gks-profile__missing-title">Гэрээ байгуулахад дараах мэдээлэл дутуу байна</p>
        <ul class="gks-profile__missing">
          <li v-for="field in completeness.missing" :key="field.field">
            <DsIcon name="circle-alert" :size="14" /> {{ field.label }}
          </li>
        </ul>
      </DsCard>

      <form class="gks-profile__form" @submit.prevent="save">
        <CrmClientFormFields
          v-model="form"
          variant="self"
          :errors="errors"
          :universities="catalogue.universities.value"
          :loading-universities="catalogue.loading.value"
        />

        <p v-if="errorMsg" class="gks-profile__error">{{ errorMsg }}</p>

        <footer class="gks-profile__actions">
          <span v-if="savedAt" class="gks-profile__saved">
            <DsIcon name="check" :size="15" /> Хадгаллаа
          </span>
          <DsButton type="submit" variant="accent" :loading="saving">Хадгалах</DsButton>
        </footer>
      </form>

      <AuthChangePassword />
    </template>
  </div>
</template>

<style scoped>
.gks-profile { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-profile__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); }
.gks-profile__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-profile__lede { margin-top: var(--sp-2); max-width: 62ch; font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-profile__skeleton { height: 320px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }

.gks-profile__missing-title { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-profile__missing { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); margin-top: var(--sp-3); list-style: none; }
.gks-profile__missing li { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }

.gks-profile__form { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-profile__error {
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--danger-line);
  background: var(--danger-bg);
  color: var(--danger-fg);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
}
.gks-profile__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-4); }
.gks-profile__saved { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--success-fg); }
</style>
