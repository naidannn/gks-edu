<script setup lang="ts">
import type { ProfileQuestionnaireView, QuestionnaireAnswers } from '@gks/shared';

/**
 * Staff filling in or correcting a client's profile questionnaire (1B-29) —
 * the family that brings the answers to the office, or a typo spotted while
 * writing the school's form. Autosaved like the client's own; staff may edit
 * after it was sent, and no submit is needed on their side.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Нэмэлт мэдээллийн асуулга' });

const route = useRoute();
const api = useApi();
const clientId = computed(() => String(route.params.clientId));

const view = ref<ProfileQuestionnaireView | null>(null);
const answers = ref<QuestionnaireAnswers>({});
const loadError = ref<string | null>(null);

const autosave = useQuestionnaireAutosave({
  current: () => ({ answers: answers.value }),
  save: async (patch) => {
    const next = await api.patch<ProfileQuestionnaireView>(`/clients/${clientId.value}/profile-questionnaire`, {
      answers: patch.answers ?? {},
    });
    view.value = { ...next, questionnaire: next.questionnaire && { ...next.questionnaire, answers: answers.value } };
  },
});

onMounted(async () => {
  try {
    view.value = await api.get<ProfileQuestionnaireView>(`/clients/${clientId.value}/profile-questionnaire`);
    answers.value = { ...(view.value.questionnaire?.answers ?? {}) };
    autosave.reset();
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Асуулгыг ачаалж чадсангүй');
  }
});

async function done() {
  await autosave.flush();
  if (autosave.state.value !== 'error') await navigateTo(`/admin/clients/${clientId.value}`);
}
</script>

<template>
  <div class="gks-apq">
    <NuxtLink :to="`/admin/clients/${clientId}`" class="gks-apq__back">
      <DsIcon name="arrow-left" :size="16" /> Үйлчлүүлэгчийн карт
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <template v-else-if="view">
      <header>
        <p class="gks-eyebrow">{{ view.applicantName }}</p>
        <h1 class="gks-apq__h1">{{ view.definition.title }}</h1>
        <p v-if="view.questionnaire?.status === 'SUBMITTED'" class="gks-apq__lead">
          Үйлчлүүлэгч илгээсэн. Энд засвал шууд хадгалагдана — үйлчлүүлэгчид буцааж нээх шаардлагагүй.
        </p>
      </header>

      <QuestionnaireForm
        v-model:answers="answers"
        :definition="view.definition"
        :save-state="autosave.state.value"
        :saved-at="autosave.savedAt.value"
        :save-error="autosave.errorMessage.value"
        :step-key="`profile-questionnaire:${clientId}`"
        submit-label="Хадгалаад буцах"
        confirm-label="Үйлчлүүлэгчийн хэлсэн мэдээллийг үнэн зөв бичсэн."
        @change="autosave.touch()"
        @step="autosave.flush()"
        @submit="done"
      />
    </template>
    <div v-else class="gks-apq__skeleton" />
  </div>
</template>

<style scoped>
.gks-apq { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1120px; }
.gks-apq__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-apq__back:hover { color: var(--brand-600); }
.gks-apq__h1 { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-apq__lead { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-apq__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
</style>
