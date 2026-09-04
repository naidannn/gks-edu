<script setup lang="ts">
import type { AdminUniversityDetail } from '@gks/shared';
import { ApiError } from '~/composables/useApi';
import { emptyUniversityForm, universityPayload, validateUniversityForm } from '~/utils/university-form';

/**
 * Register a university by hand (1A-25). Most of the catalogue comes from the
 * importer; this is for a school it does not know, so the record starts as a
 * draft and only goes live once someone has written its Mongolian intro.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const api = useApi();

const form = reactive(emptyUniversityForm());
const errors = reactive<Record<string, string>>({});
const submitting = ref(false);
const submitError = ref<string | null>(null);

/**
 * Suggests a slug from the English name, and keeps suggesting until someone
 * edits the slug themselves — at which point it stops touching their value.
 */
const suggestedSlug = ref('');
watch(() => form.nameEn, (name) => {
  if (form.slug !== suggestedSlug.value) return;
  suggestedSlug.value = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  form.slug = suggestedSlug.value;
});

async function submit() {
  submitError.value = null;
  if (!validateUniversityForm(form, errors)) {
    submitError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  submitting.value = true;
  try {
    const created = await api.post<AdminUniversityDetail>('/admin/universities', universityPayload(form));
    await navigateTo(`/admin/universities/${created.id}`);
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Хадгалахад алдаа гарлаа.';
  } finally {
    submitting.value = false;
  }
}

useHead({ title: 'Шинэ сургууль · CRM' });
</script>

<template>
  <div class="gks-form-page">
    <header>
      <NuxtLink to="/admin/universities" class="gks-form-page__back">
        <DsIcon name="arrow-left" :size="16" /> Сургуулийн жагсаалт
      </NuxtLink>
      <h1 class="gks-form-page__title">Шинэ сургууль бүртгэх</h1>
      <p class="gks-form-page__hint">
        Хөтөлбөр, элсэлтийн улирлыг хадгалсны дараа дэлгэрэнгүй хуудсан дээр нэмнэ.
      </p>
    </header>

    <form class="gks-form-page__body" @submit.prevent="submit">
      <UniversityAdminFields v-model="form" :errors="errors" />

      <DsCard v-if="submitError" accent><p class="gks-form-page__error">{{ submitError }}</p></DsCard>

      <div class="gks-form-page__actions">
        <DsButton variant="secondary" @click="navigateTo('/admin/universities')">Болих</DsButton>
        <DsButton type="submit" variant="accent" icon-left="plus" :loading="submitting">Сургууль бүртгэх</DsButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.gks-form-page { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1100px; }
.gks-form-page__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-subtle); text-decoration: none; }
.gks-form-page__back:hover { color: var(--brand-600); }
.gks-form-page__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-form-page__hint { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-form-page__body { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-form-page__error { color: var(--danger-fg); }
.gks-form-page__actions { display: flex; justify-content: flex-end; gap: var(--sp-3); }
</style>
