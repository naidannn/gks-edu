<script setup lang="ts">
import type { QuestionnaireAnswers, RecommendationItem, RecommendationListView } from '@gks/shared';

/**
 * The client typing a teacher's answers in for them (1D-27) — for the teacher
 * who would rather talk than open a link. The same form the teacher would see,
 * with one difference said up front: these are the teacher's words, not the
 * client's, and the office will read them as such.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const caseId = computed(() => String(route.params.caseId));
const id = computed(() => String(route.params.id));

const list = ref<RecommendationListView | null>(null);
const item = ref<RecommendationItem | null>(null);
const answers = ref<QuestionnaireAnswers>({});
const recommender = ref<QuestionnaireAnswers>({});
const pending = ref(true);
const loadError = ref<string | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const base = computed(() => `/cases/${caseId.value}/recommendations/${id.value}`);

const autosave = useQuestionnaireAutosave({
  current: () => ({ answers: answers.value, recommender: recommender.value }),
  save: async (patch) => {
    await api.patch(base.value, { answers: patch.answers, recommender: patch.recommender });
  },
});

onMounted(async () => {
  try {
    list.value = await api.get<RecommendationListView>(`/cases/${caseId.value}/recommendations`);
    item.value = list.value.items.find((entry) => entry.id === id.value) ?? null;
    if (!item.value) throw new Error('Тодорхойлолт олдсонгүй');
    if (!item.value.filledByApplicant) {
      await navigateTo(`/app/recommenders/${caseId.value}`, { replace: true });
      return;
    }
    answers.value = { ...(item.value.answers ?? {}) };
    recommender.value = { name: item.value.recommenderName, ...(item.value.recommender ?? {}) };
    autosave.reset({ answers: item.value.answers ?? {}, recommender: item.value.recommender ?? {} });
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
    await api.post(`${base.value}/submit`);
    await navigateTo(`/app/recommenders/${caseId.value}`);
  } catch (error) {
    submitError.value = apiErrorMessage(error, 'Илгээж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

/** The question set this letter was asked at. */
const definition = computed(() => (item.value ? list.value?.definitions[item.value.level] : null) ?? null);
const locked = computed(() => item.value && item.value.status !== 'INVITED');

useHead({ title: 'Багшийн тодорхойлолтын асуулга' });
</script>

<template>
  <div class="gks-recfill">
    <NuxtLink :to="`/app/recommenders/${caseId}`" class="gks-recfill__back">
      <DsIcon name="arrow-left" :size="16" /> Тодорхойлолтууд руу буцах
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="pending" class="gks-recfill__skeleton" />

    <template v-else-if="item && definition">
      <header class="gks-recfill__head">
        <p class="gks-eyebrow">{{ QUESTIONNAIRE_LEVEL_LABELS[item.level] }} · Багшийн тодорхойлолт</p>
        <h1 class="gks-recfill__h1">{{ item.recommenderName }}-ийн хариулт</h1>
      </header>

      <div class="gks-recfill__callout">
        <DsIcon name="message-circle-question" :size="18" />
        <div>
          <p><strong>Асуултуудыг багшдаа уншиж өгөөд, багшийн хэлснийг бичнэ үү.</strong></p>
          <p>Энэ бол таны биш, багшийн үнэлгээ. Бодит жишээ хэлүүлэхийг хичээгээрэй — «хичээнгүй» гэхээс илүү хичээнгүй байсан нэг тохиолдол хүчтэй.</p>
          <p class="gks-recfill__qualities">
            GKS-ийн үнэлдэг чанарууд: {{ definition.qualities.join(' · ') }}
          </p>
        </div>
      </div>

      <DsCard v-if="locked" padding="var(--sp-6)">
        <p class="gks-recfill__locked"><DsIcon name="lock" :size="16" /> Илгээгдсэн — засах бол зөвлөхдөө хэлнэ үү.</p>
        <QuestionnaireAnswerList :definition="definition" :answers="answers" />
      </DsCard>

      <template v-else>
        <QuestionnaireForm
          v-model:answers="answers"
          v-model:recommender="recommender"
          :definition="definition"
          :recommender-fields="definition.recommenderFields"
          :save-state="autosave.state.value"
          :saved-at="autosave.savedAt.value"
          :save-error="autosave.errorMessage.value"
          :submitting="submitting"
          :step-key="`rec:${id}`"
          submit-label="Илгээх"
          confirm-label="Эдгээр нь багшийн өөрийнх нь хэлсэн үг гэдгийг баталж байна."
          @change="autosave.touch()"
          @step="autosave.flush()"
          @submit="submit"
        />
        <p v-if="submitError" class="gks-recfill__error">{{ submitError }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-recfill { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1120px; }
.gks-recfill__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-recfill__back:hover { color: var(--brand-600); }
.gks-recfill__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-recfill__head { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-recfill__h1 { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-recfill__callout { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-4) var(--sp-5); border-radius: var(--radius-2); background: var(--info-bg); border: var(--border-hair) solid var(--info-line); color: var(--info-fg); font-size: var(--fs-body-sm); }
.gks-recfill__callout > :first-child { flex-shrink: 0; margin-top: 2px; }
.gks-recfill__callout div { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-recfill__qualities { font-size: var(--fs-caption); opacity: 0.85; }
.gks-recfill__locked { display: flex; gap: var(--sp-2); align-items: center; margin-bottom: var(--sp-4); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-recfill__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
</style>
