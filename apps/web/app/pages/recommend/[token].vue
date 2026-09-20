<script setup lang="ts">
import type { PublicRecommendationView, QuestionnaireAnswers } from '@gks/shared';

/**
 * The teacher's page (1D-27) — opened from a link a student sent, usually on a
 * phone, by someone who owes us nothing.
 *
 * So it answers the teacher's questions before asking any: who is asking, for
 * what, how long it takes, that Mongolian is fine, that nobody needs an
 * account, and who will read the answers. Then the same one-section-at-a-time
 * form the client uses, and a thank-you that tells the teacher the one thing
 * they will be asked to do later — sign across the flap, and leave it open.
 *
 * No site chrome: this is not a visit to our website, it is a favour.
 */
definePageMeta({ layout: false });
useNoIndex();

const route = useRoute();
const api = useApi();
const token = computed(() => String(route.params.token));

const view = ref<PublicRecommendationView | null>(null);
const answers = ref<QuestionnaireAnswers>({});
const recommender = ref<QuestionnaireAnswers>({});
const pending = ref(true);
const loadError = ref<string | null>(null);
const started = ref(false);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const autosave = useQuestionnaireAutosave({
  current: () => ({ answers: answers.value, recommender: recommender.value }),
  save: async (patch) => {
    await api.patch(`/recommend/${token.value}`, { answers: patch.answers, recommender: patch.recommender });
  },
});

onMounted(async () => {
  try {
    view.value = await api.get<PublicRecommendationView>(`/recommend/${token.value}`);
    answers.value = { ...view.value.answers };
    recommender.value = { name: view.value.recommenderName, ...view.value.recommender };
    autosave.reset({ answers: view.value.answers, recommender: view.value.recommender });
    started.value = Object.keys(view.value.answers).length > 0;
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Холбоос хүчингүй байна');
  } finally {
    pending.value = false;
  }
});

async function submit() {
  submitting.value = true;
  submitError.value = null;
  try {
    await autosave.flush();
    view.value = await api.post<PublicRecommendationView>(`/recommend/${token.value}/submit`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    submitError.value = apiErrorMessage(error, 'Илгээж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

const LEVEL_WORD = { BACHELOR: 'бакалаврын', MASTER: 'магистрын', PHD: 'докторын' } as const;
const totalMinutes = computed(() => (view.value ? minutesLeft(view.value.definition, {}) : 0));

useHead({ title: 'Багшийн тодорхойлолт' });
</script>

<template>
  <div class="gks-teacher">
    <header class="gks-teacher__bar">
      <img src="~/assets/img/gks-logo-mark.png" alt="" class="gks-teacher__logo">
      <span class="gks-teacher__brand">GKS EDU</span>
      <span class="gks-teacher__bar-sep" />
      <span class="gks-teacher__bar-title">Багшийн тодорхойлолт</span>
    </header>

    <main class="gks-teacher__main">
      <DsCard v-if="loadError" accent padding="var(--sp-6)">
        <p class="gks-teacher__h2">Холбоос нээгдсэнгүй</p>
        <p class="gks-teacher__p">{{ loadError }}</p>
      </DsCard>
      <div v-else-if="pending" class="gks-teacher__skeleton" />

      <template v-else-if="view">
        <!-- ── Sent ─────────────────────────────────────────────── -->
        <section v-if="view.locked" class="gks-teacher__card">
          <span class="gks-teacher__done"><DsIcon name="heart-handshake" :size="30" /></span>
          <h1 class="gks-teacher__h1">Баярлалаа!</h1>
          <p class="gks-teacher__p">
            Таны хариулт GKS EDU төвд ирлээ. Үүнд үндэслэн манай мэргэжилтэн англи хэл дээрх Recommendation Letter-ийг
            бэлтгэнэ.
          </p>
          <h2 class="gks-teacher__h2">Дараа нь юу болох вэ?</h2>
          <ol class="gks-teacher__steps">
            <li><strong>{{ view.applicantName }}</strong> англи хувилбарыг хэвлээд танд авчирна.</li>
            <li>Та уншиж, <strong>огноо бичиж, гарын үсэг</strong> зурна.</li>
            <li>Тодорхойлолтыг дугтуйнд хийж, <strong>дугтуйн арын амсар дээгүүр гарын үсэг</strong> зурна.</li>
          </ol>
          <QuestionnaireEnvelopeNotice compact />
          <p class="gks-teacher__muted">Хариултаа засах шаардлага гарвал {{ view.applicantName }}-д хэлэхэд хангалттай.</p>
        </section>

        <!-- ── Welcome ──────────────────────────────────────────── -->
        <section v-else-if="!started" class="gks-teacher__card">
          <p class="gks-eyebrow">GKS тэтгэлэг · {{ QUESTIONNAIRE_LEVEL_LABELS[view.level] }}</p>
          <h1 class="gks-teacher__h1">Сайн байна уу, {{ view.recommenderName }}.</h1>
          <p class="gks-teacher__lead">
            <strong>{{ view.applicantName }}</strong> БНСУ-ын Засгийн газрын тэтгэлэг (GKS)-ийн {{ LEVEL_WORD[view.level] }}
            хөтөлбөрт материал бүрдүүлж байгаа бөгөөд танаас тодорхойлолт хүсэж байна.
          </p>

          <ul class="gks-teacher__facts">
            <li><DsIcon name="clock" :size="18" /><span>Ойролцоогоор <strong>{{ totalMinutes }} минут</strong></span></li>
            <li><DsIcon name="languages" :size="18" /><span><strong>Монголоор</strong> бичнэ — англи руу бид хөрвүүлнэ</span></li>
            <li><DsIcon name="save" :size="18" /><span>Бичих зуур <strong>хадгалагдана</strong> — энэ холбоосоор дахин орж үргэлжлүүлнэ</span></li>
            <li><DsIcon name="lock" :size="18" /><span>Таны хариулт зөвхөн <strong>GKS EDU төвийн мэргэжилтэнд</strong> харагдана</span></li>
          </ul>

          <div class="gks-teacher__qualities">
            <p class="gks-teacher__qualities-title">GKS комисс тодорхойлолтоос эдгээрийг хардаг:</p>
            <ul>
              <li v-for="quality in view.definition.qualities" :key="quality">{{ quality }}</li>
            </ul>
            <p v-if="view.definition.qualitiesNote" class="gks-teacher__muted">{{ view.definition.qualitiesNote }}</p>
          </div>

          <p v-for="(paragraph, index) in view.definition.intro" :key="index" class="gks-teacher__p">{{ paragraph }}</p>

          <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="started = true">Эхлэх</DsButton>
        </section>

        <!-- ── The questionnaire ────────────────────────────────── -->
        <template v-else>
          <p class="gks-teacher__about">
            <strong>{{ view.applicantName }}</strong>-ийн GKS {{ LEVEL_WORD[view.level] }} тэтгэлгийн тодорхойлолт
          </p>
          <QuestionnaireForm
            v-model:answers="answers"
            v-model:recommender="recommender"
            :definition="view.definition"
            :recommender-fields="view.definition.recommenderFields"
            :save-state="autosave.state.value"
            :saved-at="autosave.savedAt.value"
            :save-error="autosave.errorMessage.value"
            :submitting="submitting"
            :step-key="`teacher:${token.slice(0, 12)}`"
            submit-label="Тодорхойлолт илгээх"
            confirm-label="Миний өгсөн мэдээлэл үнэн зөв бөгөөд үүнд үндэслэн тодорхойлолт бэлтгэхийг зөвшөөрч байна."
            @change="autosave.touch()"
            @step="autosave.flush()"
            @submit="submit"
          />
          <p v-if="submitError" class="gks-teacher__error">{{ submitError }}</p>
        </template>
      </template>
    </main>

    <footer class="gks-teacher__foot">
      «Жи Кэй Эс Эдү Групп» ХХК · <a href="https://gksedu.mn" target="_blank" rel="noopener">gksedu.mn</a>
    </footer>
  </div>
</template>

<style scoped>
.gks-teacher { min-height: 100vh; display: flex; flex-direction: column; background: var(--surface-page); }
.gks-teacher__bar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-5);
  border-bottom: var(--border-hair) solid var(--line-hairline);
  background: var(--surface-card);
}
.gks-teacher__logo { height: 24px; width: auto; }
.gks-teacher__brand { font-family: var(--font-display); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-teacher__bar-sep { width: 1px; height: 18px; background: var(--line-strong); }
.gks-teacher__bar-title { font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-teacher__main { flex: 1; width: 100%; max-width: 1120px; margin: 0 auto; padding: var(--sp-6) var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-teacher__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-teacher__card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 680px;
  margin: 0 auto;
  padding: var(--sp-7);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.gks-teacher__card > .gks-btn { align-self: flex-start; }
.gks-teacher__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); line-height: var(--lh-heading); }
.gks-teacher__h2 { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-teacher__lead { font-size: var(--fs-body-lg); line-height: var(--lh-body); color: var(--text-body); }
.gks-teacher__p { color: var(--text-body); line-height: var(--lh-body); font-size: var(--fs-body-sm); }
.gks-teacher__muted { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-teacher__about { font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-teacher__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-teacher__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-teacher__facts li { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken); font-size: var(--fs-body-sm); }
.gks-teacher__facts li > :first-child { flex-shrink: 0; color: var(--brand-600); margin-top: 1px; }
.gks-teacher__qualities { padding: var(--sp-4) var(--sp-5); border-left: var(--border-rail) solid var(--brand-600); background: var(--brand-025); border-radius: 0 var(--radius-2) var(--radius-2) 0; display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-teacher__qualities-title { font-weight: var(--fw-semibold); color: var(--text-strong); font-size: var(--fs-body-sm); }
.gks-teacher__qualities ul { display: flex; flex-direction: column; gap: var(--sp-1); padding-left: var(--sp-4); list-style: disc; font-size: var(--fs-body-sm); }

.gks-teacher__done { display: grid; place-items: center; width: 60px; height: 60px; border-radius: 50%; background: var(--success-bg); color: var(--success-fg); }
.gks-teacher__steps { display: flex; flex-direction: column; gap: var(--sp-2); padding-left: var(--sp-5); list-style: decimal; font-size: var(--fs-body-sm); }

.gks-teacher__foot { padding: var(--sp-5); text-align: center; font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-teacher__foot a { color: inherit; }

@media (max-width: 700px) {
  .gks-teacher__card { padding: var(--sp-5); }
  .gks-teacher__facts { grid-template-columns: minmax(0, 1fr); }
  .gks-teacher__main { padding: var(--sp-4) var(--sp-3); }
}
</style>
