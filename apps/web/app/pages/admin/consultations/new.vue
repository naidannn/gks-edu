<script setup lang="ts">
import type { LeadDetail, LeadListItem, PaginatedResult } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
import { emptyLeadForm, leadPayload, normalizedPhone, stripPhone, validateLeadForm } from '~/utils/lead-form';

/**
 * Register the person sitting at the desk (1B-19).
 *
 * The office's first conversation is where the sale's raw material is
 * collected — contact details, what they have studied, what they are after —
 * and until now there was no way to write it down except the public form the
 * visitor fills in themselves.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

type StaffMember = { id: string; name: string | null; email: string | null; role: string };

const auth = useAuthStore();
const api = useApi();

const form = reactive(emptyLeadForm());
const errors = reactive<Record<string, string>>({});

const { universities, loading: universitiesLoading, load: loadUniversities } = useUniversityCatalogue();
const staff = ref<StaffMember[]>([]);

onMounted(async () => {
  await Promise.all([
    loadUniversities(),
    api.get<StaffMember[]>('/users/staff').then((people) => { staff.value = people; }),
  ]);
  // Whoever is typing is the one who gave the advice, so they are the default.
  if (auth.user && !form.assignedToId) form.assignedToId = auth.user.id;
});

/**
 * Someone who enquired online last week and walks in today is the same person.
 * The number is checked as it is typed so the consultant can open the existing
 * record instead of creating a second one — nothing is blocked, because they
 * are looking at the person and the merge tool exists for the rest (1B-09).
 */
const existing = ref<LeadListItem[]>([]);
let phoneTimer: ReturnType<typeof setTimeout> | undefined;

watch(() => form.phone, (value) => {
  clearTimeout(phoneTimer);
  if (!/^(976)?\d{8}$/.test(stripPhone(value))) {
    existing.value = [];
    return;
  }
  // Search the stored form, not the typed one — a saved number never carries
  // its country code.
  const phone = normalizedPhone(value);
  phoneTimer = setTimeout(async () => {
    try {
      const found = await api.get<PaginatedResult<LeadListItem>>('/leads', { query: { q: phone, limit: 5 } });
      existing.value = found.items;
    } catch {
      existing.value = [];
    }
  }, 400);
});
onBeforeUnmount(() => clearTimeout(phoneTimer));

const submitting = ref(false);
const submitError = ref<string | null>(null);

async function submit() {
  submitError.value = null;
  if (!validateLeadForm(form, errors)) {
    submitError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  submitting.value = true;
  try {
    const created = await api.post<LeadDetail>('/leads', leadPayload(form));
    await navigateTo(`/admin/consultations/${created.id}`);
  } catch (err) {
    submitError.value = apiErrorMessage(err, 'Хадгалахад алдаа гарлаа.');
  } finally {
    submitting.value = false;
  }
}

useHead({ title: 'Зөвлөгөө бүртгэх · CRM' });
</script>

<template>
  <div class="gks-page gks-page--form">
    <header>
      <NuxtLink to="/admin/consultations" class="gks-page__back">
        <DsIcon name="arrow-left" :size="16" /> Зөвлөгөө хүсэлт
      </NuxtLink>
      <h1 class="gks-page__title">Зөвлөгөө бүртгэх</h1>
      <p class="gks-page__hint">
        Оффис дээр ирсэн хүнийг ярилцаж байхдаа бүртгэнэ. Овог, нэр, утас л заавал —
        үлдсэнийг мэдсэн хэрээрээ нөхөж болно.
      </p>
    </header>

    <DsCard v-if="existing.length" accent>
      <p class="gks-lead-new__dupe-title">
        <DsIcon name="triangle-alert" :size="16" />
        Энэ дугаартай бүртгэл аль хэдийн байна:
      </p>
      <ul class="gks-lead-new__dupe-list">
        <li v-for="match in existing" :key="match.id">
          <NuxtLink :to="`/admin/consultations/${match.id}`">
            {{ match.lastName }} {{ match.firstName }}
          </NuxtLink>
          <span class="gks-lead-new__dupe-meta">
            {{ LEAD_SOURCE_LABELS[match.source] }} · {{ LEAD_STAGE_LABELS[match.stage] }} ·
            {{ formatDate(match.createdAt) }}
          </span>
        </li>
      </ul>
      <p class="gks-lead-new__dupe-hint">
        Тэр хүн мөн бол шинээр бүртгэхийн оронд хуучин бүртгэлийг нь нээгээрэй.
      </p>
    </DsCard>

    <form class="gks-form-body" @submit.prevent="submit">
      <CrmLeadFormFields
        v-model="form"
        :errors="errors"
        :universities="universities"
        :loading-universities="universitiesLoading"
        :staff="staff"
      />

      <DsCard v-if="submitError" accent><p class="gks-lead-new__error">{{ submitError }}</p></DsCard>

      <div class="gks-form-actions">
        <DsButton variant="secondary" @click="navigateTo('/admin/consultations')">Болих</DsButton>
        <DsButton type="submit" variant="accent" icon-left="user-plus" :loading="submitting">Бүртгэх</DsButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.gks-page__hint { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-lead-new__dupe-title { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; }
.gks-lead-new__dupe-list { margin: var(--sp-3) 0; padding-left: var(--sp-5); display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-lead-new__dupe-meta { margin-left: var(--sp-2); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-lead-new__dupe-hint { color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-lead-new__error { color: var(--danger-fg); }
.gks-form-actions { justify-content: flex-end; }
</style>
