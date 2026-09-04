<script setup lang="ts">
import type { ClientDetail, LeadDetail } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
import { ApiError } from '~/composables/useApi';
import { clientPayload, emptyClientForm, fillFromLead, validateClientForm } from '~/utils/client-form';

/**
 * Register a client (1B-14). Reached either straight from the client list, or
 * from a lead with `?leadId=` — in which case the same form posts to the
 * conversion endpoint and the lead keeps its own history (1B-10).
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const auth = useAuthStore();
const api = useApi();

const leadId = computed(() => (typeof route.query.leadId === 'string' ? route.query.leadId : null));

const form = reactive(emptyClientForm());
const errors = reactive<Record<string, string>>({});
const openCase = ref(true);
const assignToMe = ref(true);

const { universities, loading: universitiesLoading, load: loadUniversities } = useUniversityCatalogue();
const lead = ref<LeadDetail | null>(null);

onMounted(async () => {
  const tasks: Promise<unknown>[] = [loadUniversities()];
  if (leadId.value) {
    tasks.push(
      api.get<LeadDetail>(`/leads/${leadId.value}`).then((found) => {
        lead.value = found;
        fillFromLead(form, found);
      }),
    );
  }
  await Promise.all(tasks);
});

const submitting = ref(false);
const submitError = ref<string | null>(null);

async function submit() {
  submitError.value = null;
  if (!validateClientForm(form, errors)) {
    submitError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  submitting.value = true;
  try {
    const path = leadId.value ? `/clients/from-lead/${leadId.value}` : '/clients';
    const created = await api.post<ClientDetail>(path, {
      ...clientPayload(form),
      openCase: openCase.value,
      ...(assignToMe.value && auth.user ? { assignedConsultantId: auth.user.id } : {}),
    });
    await navigateTo(`/admin/clients/${created.id}`);
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.message : 'Хадгалахад алдаа гарлаа.';
  } finally {
    submitting.value = false;
  }
}

useHead({ title: leadId.value ? 'Сэжмээс хэрэглэгч үүсгэх · CRM' : 'Шинэ хэрэглэгч · CRM' });
</script>

<template>
  <div class="gks-form-page">
    <header>
      <NuxtLink to="/admin/clients" class="gks-form-page__back">
        <DsIcon name="arrow-left" :size="16" /> Үйлчлүүлэгчийн жагсаалт
      </NuxtLink>
      <h1 class="gks-form-page__title">{{ leadId ? 'Сэжмээс хэрэглэгч бүртгэх' : 'Шинэ хэрэглэгч бүртгэх' }}</h1>
      <p v-if="lead" class="gks-form-page__hint">
        <DsIcon name="user-search" :size="14" />
        {{ lead.lastName }} {{ lead.firstName }} сэжмээс — сэжмийн бүртгэл түүхэндээ хэвээр үлдэнэ.
      </p>
      <p v-else class="gks-form-page__hint">
        Сэжимгүйгээр шууд бүртгэнэ. Гэрээ байгуулахад шаардлагатай мэдээллийг бүрэн авна.
      </p>
    </header>

    <form class="gks-form-page__body" @submit.prevent="submit">
      <CrmClientFormFields
        v-model="form"
        :errors="errors"
        :universities="universities"
        :loading-universities="universitiesLoading"
      >
        <template #service-extra>
          <div class="gks-form-page__switches">
            <DsCheckbox
              v-model="openCase"
              label="Зуучлалын хэргийг шууд нээх"
              description="Сонгосон үйлчилгээгээр хэрэг үүсч, «Гэрээ бэлтгэж буй» шатнаас эхэлнэ."
            />
            <DsCheckbox v-model="assignToMe" label="Би хариуцна" description="Хариуцах зөвлөхөөр өөрийгөө тохируулна." />
          </div>
        </template>
      </CrmClientFormFields>

      <DsCard v-if="submitError" accent><p class="gks-form-page__error">{{ submitError }}</p></DsCard>

      <div class="gks-form-page__actions">
        <DsButton variant="secondary" @click="navigateTo(leadId ? `/admin/consultations/${leadId}` : '/admin/clients')">
          Болих
        </DsButton>
        <DsButton type="submit" variant="accent" icon-left="user-plus" :loading="submitting">
          {{ leadId ? 'Үйлчлүүлэгч болгож бүртгэх' : 'Үйлчлүүлэгч бүртгэх' }}
        </DsButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.gks-form-page { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 960px; }
.gks-form-page__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-subtle); text-decoration: none; }
.gks-form-page__back:hover { color: var(--brand-600); }
.gks-form-page__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-form-page__hint { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-form-page__body { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-form-page__switches { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-form-page__error { color: var(--danger-fg); }
.gks-form-page__actions { display: flex; justify-content: flex-end; gap: var(--sp-3); }
</style>
