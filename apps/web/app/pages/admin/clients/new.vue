<script setup lang="ts">
import type { ClientDetail, LeadDetail } from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
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

/**
 * 1B-26 — the number may already be a client, and the person's enquiries are
 * linked to the new client on save when the given name agrees. Shown before
 * saving so neither surprises anyone.
 */
const { clients: phoneClients, leads: phoneLeads } = useExistingPerson(() => form.phone);
const leadsToLink = computed(() =>
  phoneLeads.value.filter((match) => !match.client && match.id !== leadId.value),
);

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
    const created = await api.post<ClientDetail & { accountLinked?: boolean }>(path, {
      ...clientPayload(form),
      openCase: openCase.value,
      ...(assignToMe.value && auth.user ? { assignedConsultantId: auth.user.id } : {}),
    });
    // The client had already signed up on the site, so their service went onto
    // the account they own and no invitation was sent — the record says so once.
    await navigateTo(`/admin/clients/${created.id}${created.accountLinked ? '?linked=1' : ''}`);
  } catch (err) {
    submitError.value = apiErrorMessage(err, 'Хадгалахад алдаа гарлаа.');
  } finally {
    submitting.value = false;
  }
}

useHead({ title: leadId.value ? 'Сэжмээс хэрэглэгч үүсгэх · CRM' : 'Шинэ хэрэглэгч · CRM' });
</script>

<template>
  <div class="gks-page gks-page--form">
    <header>
      <NuxtLink to="/admin/clients" class="gks-page__back">
        <DsIcon name="arrow-left" :size="16" /> Үйлчлүүлэгчийн жагсаалт
      </NuxtLink>
      <h1 class="gks-page__title">{{ leadId ? 'Сэжмээс хэрэглэгч бүртгэх' : 'Шинэ хэрэглэгч бүртгэх' }}</h1>
      <p v-if="lead" class="gks-page__hint">
        <DsIcon name="user-search" :size="14" />
        {{ lead.lastName }} {{ lead.firstName }} сэжмээс — сэжмийн бүртгэл түүхэндээ хэвээр үлдэнэ.
      </p>
      <p v-else class="gks-page__hint">
        Сэжимгүйгээр шууд бүртгэнэ. Гэрээ байгуулахад шаардлагатай мэдээллийг бүрэн авна.
      </p>
      <p class="gks-page__hint">
        <DsIcon name="mail" :size="14" />
        Имэйл хаяг бөглөвөл кабинет идэвхжүүлэх урилга бүртгэмэгц тэр хаяг руу илгээгдэнэ — холбоос 7 хоног хүчинтэй.
        Сайт дээр өөрөө бүртгүүлсэн хүн бол үйлчилгээ нь тэр бүртгэл дээр нь холбогдоно.
      </p>
    </header>

    <DsCard v-if="phoneClients.length" accent>
      <p class="gks-form-page__match-title">
        <DsIcon name="triangle-alert" :size="16" />
        Энэ дугаартай үйлчлүүлэгч аль хэдийн байна:
      </p>
      <ul class="gks-form-page__match-list">
        <li v-for="match in phoneClients" :key="match.id">
          <NuxtLink :to="`/admin/clients/${match.id}`">{{ match.code }} · {{ match.lastName }} {{ match.firstName }}</NuxtLink>
        </li>
      </ul>
      <p class="gks-form-page__match-hint">Тэр хүн мөн бол дахин бүртгэхгүй. Ах дүү нэг утас хэрэглэдэг бол үргэлжлүүлж болно.</p>
    </DsCard>

    <DsCard v-if="leadsToLink.length">
      <p class="gks-form-page__match-title">
        <DsIcon name="link" :size="16" />
        Энэ дугаартай зөвлөгөөний хүсэлт:
      </p>
      <ul class="gks-form-page__match-list">
        <li v-for="match in leadsToLink" :key="match.id">
          <NuxtLink :to="`/admin/consultations/${match.id}`">{{ match.lastName }} {{ match.firstName }}</NuxtLink>
          <span class="gks-form-page__match-meta">
            {{ LEAD_SOURCE_LABELS[match.source] }} · {{ LEAD_STAGE_LABELS[match.stage] }} · {{ formatDate(match.createdAt) }}
          </span>
        </li>
      </ul>
      <p class="gks-form-page__match-hint">
        Нэр нь таарвал хадгалахад үйлчлүүлэгчтэй автоматаар холбогдож, сэжим «Гэрээ болсон» болно.
      </p>
    </DsCard>

    <form class="gks-form-body" @submit.prevent="submit">
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
              label="Зуучлалын үйлчилгээг шууд эхлүүлэх"
              description="Сонгосон үйлчилгээ «Гэрээ бэлтгэж буй» шатнаас эхэлнэ."
            />
            <DsCheckbox v-model="assignToMe" label="Би хариуцна" description="Хариуцах зөвлөхөөр өөрийгөө тохируулна." />
          </div>
        </template>
      </CrmClientFormFields>

      <DsCard v-if="submitError" accent><p class="gks-form-page__error">{{ submitError }}</p></DsCard>

      <div class="gks-form-actions">
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
.gks-page__hint { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-form-page__switches { display: flex; flex-direction: column; gap: var(--sp-2); margin-top: var(--sp-4); }
.gks-form-page__error { color: var(--danger-fg); }
.gks-form-page__match-title { display: flex; align-items: center; gap: var(--sp-2); font-weight: 600; }
.gks-form-page__match-list { display: flex; flex-direction: column; gap: var(--sp-1); margin: var(--sp-2) 0; }
.gks-form-page__match-meta { margin-left: var(--sp-2); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-form-page__match-hint { color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-form-actions { justify-content: flex-end; }
</style>
