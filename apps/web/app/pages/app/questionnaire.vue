<script setup lang="ts">
import type { ProfileQuestionnaireView, QuestionnaireAnswers } from '@gks/shared';

/**
 * «Нэмэлт мэдээллийн асуулга» (1B-29) — what the office needs once someone has
 * become a client: their high school (language prep and bachelor's only), the
 * family's work and income, and the dormitory. The same walk as the essay
 * questionnaire, autosaved, but short enough to need no intro screen.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });
useHead({ title: 'Нэмэлт мэдээллийн асуулга' });

const api = useApi();

const view = ref<ProfileQuestionnaireView | null>(null);
const answers = ref<QuestionnaireAnswers>({});
const pending = ref(true);
const loadError = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const autosave = useQuestionnaireAutosave({
  current: () => ({ answers: answers.value }),
  save: async (patch) => {
    const next = await api.patch<ProfileQuestionnaireView>('/me/profile-questionnaire', { answers: patch.answers ?? {} });
    // Keep the server's status and dates, never its copy of the answers: the
    // client may have typed on while this request was out.
    view.value = { ...next, questionnaire: next.questionnaire && { ...next.questionnaire, answers: answers.value } };
  },
});

onMounted(async () => {
  try {
    view.value = await api.get<ProfileQuestionnaireView>('/me/profile-questionnaire');
    answers.value = { ...(view.value.questionnaire?.answers ?? {}) };
    autosave.reset();
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Асуулгыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
});

async function submit() {
  submitting.value = true;
  submitError.value = null;
  try {
    await autosave.flush();
    view.value = await api.post<ProfileQuestionnaireView>('/me/profile-questionnaire/submit');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    submitError.value = apiErrorMessage(error, 'Илгээж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

const submitted = computed(() => view.value?.questionnaire?.status === 'SUBMITTED');
</script>

<template>
  <div class="gks-pq">
    <NuxtLink to="/app" class="gks-pq__back"><DsIcon name="arrow-left" :size="16" /> Миний булан</NuxtLink>

    <DsCard v-if="loadError" accent>
      <p>{{ loadError }}</p>
      <DsButton variant="accent" icon-right="arrow-right" class="gks-pq__cta" @click="navigateTo('/app/profile')">
        Миний мэдээлэл
      </DsButton>
    </DsCard>
    <div v-else-if="pending" class="gks-pq__skeleton" />

    <template v-else-if="view">
      <template v-if="submitted">
        <DsCard padding="var(--sp-6)">
          <div class="gks-pq__done">
            <span class="gks-pq__done-icon"><DsIcon name="check" :size="28" /></span>
            <div>
              <h1 class="gks-pq__h1">Асуулга илгээгдлээ</h1>
              <p class="gks-pq__lead">
                {{ view.questionnaire?.submittedAt ? formatLongDate(view.questionnaire.submittedAt) : '' }}-нд илгээсэн.
                Зөвлөх тань эдгээр мэдээллээр сургуулийн мэдүүлэг, визний материалыг бэлтгэнэ.
                Засах зүйл гарвал <NuxtLink to="/messages">зөвлөхдөө чатаар бичээрэй</NuxtLink>.
              </p>
            </div>
          </div>
        </DsCard>
        <DsCard title="Таны илгээсэн хариултууд" padding="var(--sp-6)">
          <QuestionnaireAnswerList :definition="view.definition" :answers="answers" answered-only />
        </DsCard>
      </template>

      <template v-else>
        <header>
          <p class="gks-eyebrow">Үйлчлүүлэгч · {{ view.applicantName }}</p>
          <h1 class="gks-pq__h1">{{ view.definition.title }}</h1>
          <p v-for="(paragraph, index) in view.definition.intro" :key="index" class="gks-pq__lead">{{ paragraph }}</p>
        </header>

        <DsCard v-if="view.questionnaire?.reopenNote" accent>
          <p class="gks-pq__reopen">
            <DsIcon name="message-square-warning" :size="18" />
            <span><strong>Зөвлөхийн тэмдэглэл:</strong> {{ view.questionnaire.reopenNote }}</span>
          </p>
        </DsCard>

        <QuestionnaireForm
          v-model:answers="answers"
          :definition="view.definition"
          :save-state="autosave.state.value"
          :saved-at="autosave.savedAt.value"
          :save-error="autosave.errorMessage.value"
          :submitting="submitting"
          step-key="profile-questionnaire"
          submit-label="Зөвлөхөд илгээх"
          @change="autosave.touch()"
          @step="autosave.flush()"
          @submit="submit"
        />
        <p v-if="submitError" class="gks-pq__error">{{ submitError }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-pq { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1120px; }
.gks-pq__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-pq__back:hover { color: var(--brand-600); }
.gks-pq__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-pq__cta { margin-top: var(--sp-4); }

.gks-pq__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); line-height: var(--lh-heading); }
.gks-pq__lead { margin-top: var(--sp-2); color: var(--text-body); line-height: var(--lh-body); }
.gks-pq__reopen { display: flex; gap: var(--sp-3); align-items: flex-start; font-size: var(--fs-body-sm); }
.gks-pq__reopen > :first-child { flex-shrink: 0; color: var(--red-700); margin-top: 2px; }
.gks-pq__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-pq__done { display: flex; gap: var(--sp-4); align-items: flex-start; }
.gks-pq__done-icon { display: grid; place-items: center; flex-shrink: 0; width: 52px; height: 52px; border-radius: 50%; background: var(--success-bg); color: var(--success-fg); }
</style>
