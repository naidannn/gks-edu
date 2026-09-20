<script setup lang="ts">
import type { EssayQuestionnaireView, QuestionnaireAnswers, QuestionnaireLevel } from '@gks/shared';

/**
 * The essay questionnaire (1D-27) — its own page, away from the case tabs, so
 * a long sitting of writing has the whole width and nothing else asking for
 * attention.
 *
 * Four states, in the order a client meets them: which level (only if we could
 * not tell), a short "how this works", the form itself, and "sent" with what
 * happens next.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const caseId = computed(() => String(route.params.caseId));

const view = ref<EssayQuestionnaireView | null>(null);
const answers = ref<QuestionnaireAnswers>({});
const pending = ref(true);
const loadError = ref<string | null>(null);
const started = ref(false);
const choosingLevel = ref(false);
const pickingLevel = ref<QuestionnaireLevel | null>(null);
const submitting = ref(false);
const submitError = ref<string | null>(null);

const autosave = useQuestionnaireAutosave({
  current: () => ({ answers: answers.value }),
  save: async (patch) => {
    const next = await api.patch<EssayQuestionnaireView>(`/cases/${caseId.value}/essay`, { answers: patch.answers ?? {} });
    // Keep the server's status and dates, never its copy of the answers: the
    // client may have typed on while this request was out.
    if (view.value) view.value = { ...next, questionnaire: next.questionnaire && { ...next.questionnaire, answers: answers.value } };
  },
});

async function load() {
  pending.value = true;
  try {
    view.value = await api.get<EssayQuestionnaireView>(`/cases/${caseId.value}/essay`);
    answers.value = { ...(view.value.questionnaire?.answers ?? {}) };
    autosave.reset();
    started.value = Object.keys(answers.value).length > 0;
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Асуулгыг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const LEVELS: { level: QuestionnaireLevel; who: string }[] = [
  { level: 'BACHELOR', who: 'ЕБС төгссөн эсвэл 12-р ангид сурч буй' },
  { level: 'MASTER', who: 'Бакалаврын зэрэгтэй' },
  { level: 'PHD', who: 'Магистрын зэрэгтэй' },
];

async function pickLevel(level: QuestionnaireLevel) {
  pickingLevel.value = level;
  try {
    view.value = await api.patch<EssayQuestionnaireView>(`/cases/${caseId.value}/essay`, { level });
    choosingLevel.value = false;
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'Түвшин сонгож чадсангүй');
  } finally {
    pickingLevel.value = null;
  }
}

async function submit() {
  submitting.value = true;
  submitError.value = null;
  try {
    await autosave.flush();
    view.value = await api.post<EssayQuestionnaireView>(`/cases/${caseId.value}/essay/submit`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    submitError.value = apiErrorMessage(error, 'Илгээж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

const definition = computed(() => view.value?.definition ?? null);
const submitted = computed(() => view.value?.questionnaire?.status === 'SUBMITTED');
const needsLevel = computed(() => !view.value?.level || choosingLevel.value);
const sectionCount = computed(() => definition.value?.parts.reduce((sum, part) => sum + part.sections.length, 0) ?? 0);
const totalMinutes = computed(() => (definition.value ? minutesLeft(definition.value, {}) : 0));

useHead({ title: 'Эссэ бэлтгэх асуулга' });
</script>

<template>
  <div class="gks-essay">
    <NuxtLink :to="`/app/cases/${caseId}/documents`" class="gks-essay__back">
      <DsIcon name="arrow-left" :size="16" /> Материал руу буцах
    </NuxtLink>

    <DsCard v-if="loadError" accent><p>{{ loadError }}</p></DsCard>
    <div v-else-if="pending" class="gks-essay__skeleton" />

    <template v-else-if="view">
      <!-- ── 1. Which level ──────────────────────────────────────── -->
      <section v-if="needsLevel && !submitted" class="gks-essay__intro">
        <p class="gks-eyebrow">GKS тэтгэлэг · Эссэ</p>
        <h1 class="gks-essay__h1">Аль түвшинд тэтгэлэг хүсэж байна вэ?</h1>
        <p class="gks-essay__lead">Түвшин бүрийн асуулга өөр. Сонгосны дараа ч солих боломжтой.</p>
        <div class="gks-essay__levels">
          <button
            v-for="option in LEVELS"
            :key="option.level"
            type="button"
            class="gks-essay__level"
            :class="{ 'gks-essay__level--suggested': option.level === (view.level ?? view.suggestedLevel) }"
            :disabled="pickingLevel !== null"
            @click="pickLevel(option.level)"
          >
            <span v-if="option.level === (view.level ?? view.suggestedLevel)" class="gks-essay__level-tag">Танд тохирох</span>
            <span class="gks-essay__level-name">{{ QUESTIONNAIRE_LEVEL_LABELS[option.level] }}</span>
            <span class="gks-essay__level-who">{{ option.who }}</span>
            <DsIcon :name="pickingLevel === option.level ? 'loader-circle' : 'arrow-right'" :size="18" />
          </button>
        </div>
      </section>

      <!-- ── 4. Sent ─────────────────────────────────────────────── -->
      <template v-else-if="submitted && definition">
        <DsCard padding="var(--sp-6)">
          <div class="gks-essay__done">
            <span class="gks-essay__done-icon"><DsIcon name="check" :size="28" /></span>
            <div>
              <h1 class="gks-essay__h1">Асуулга мэргэжилтэнд илгээгдлээ</h1>
              <p class="gks-essay__lead">
                {{ view.questionnaire?.submittedAt ? formatLongDate(view.questionnaire.submittedAt) : '' }}-нд илгээсэн.
                Одоо манай мэргэжилтэн таны хариултад үндэслэн эссэг бичиж эхэлнэ.
              </p>
            </div>
          </div>
          <ol class="gks-essay__next">
            <li><strong>Мэргэжилтэн уншина.</strong> Тодруулах зүйл гарвал зөвлөх тань чатаар эсвэл утсаар холбогдоно.</li>
            <li><strong>Эссэ бичигдэнэ.</strong> Personal Statement болон Study Plan англи эсвэл солонгос хэлээр бэлтгэгдэнэ.</li>
            <li><strong>Та хянана.</strong> Эцсийн хувилбарыг танд уншуулж, баталгаажуулсны дараа мэдүүлэгт хавсаргана.</li>
          </ol>
          <p class="gks-essay__muted">Нэмж хэлэх зүйл санаанд орвол <NuxtLink to="/messages">зөвлөхдөө чатаар бичээрэй</NuxtLink>.</p>
        </DsCard>

        <DsCard title="Таны илгээсэн хариултууд" padding="var(--sp-6)">
          <QuestionnaireAnswerList :definition="definition" :answers="answers" answered-only />
        </DsCard>
      </template>

      <!-- ── 2. How this works ──────────────────────────────────── -->
      <section v-else-if="!started && definition" class="gks-essay__intro">
        <p class="gks-eyebrow">GKS тэтгэлэг · {{ QUESTIONNAIRE_LEVEL_LABELS[definition.level] }}</p>
        <h1 class="gks-essay__h1">Эссэ бэлтгэх асуулга</h1>
        <p v-for="(paragraph, index) in definition.intro" :key="index" class="gks-essay__lead">{{ paragraph }}</p>

        <ul class="gks-essay__facts">
          <li><DsIcon name="layers" :size="18" /><span><strong>{{ sectionCount }} хэсэг</strong>, нэг дэлгэцэнд нэг хэсэг</span></li>
          <li><DsIcon name="clock" :size="18" /><span>Нийт <strong>~{{ totalMinutes }} минут</strong> — хэд хуваагаад бөглөж болно</span></li>
          <li><DsIcon name="save" :size="18" /><span>Бичих зуур <strong>автоматаар хадгална</strong>, дараа нь үргэлжлүүлнэ</span></li>
          <li><DsIcon name="languages" :size="18" /><span><strong>Монголоор</strong> бичнэ — хөрвүүлэлтийг бид хийнэ</span></li>
        </ul>

        <div class="gks-essay__tips">
          <p class="gks-essay__tips-title">Сайн хариулт гэж юу вэ?</p>
          <ul>
            <li>Ерөнхий үг биш, <strong>бодит жишээ</strong>: «хариуцлагатай» гэхийн оронд хариуцлагатай байсан нэг үйл явдлаа бичээрэй.</li>
            <li><strong>Он, сар, нэр</strong> — сургууль, тэмцээн, байгууллагын нэрийг бүтнээр нь.</li>
            <li><strong>Үнэн зөв</strong> — комисс ярилцлагаар шалгадаг тул хэтрүүлэх шаардлагагүй.</li>
            <li>Мэдэхгүй асуултаа <strong>алгасаж болно</strong>. Зөвхөн <span class="gks-essay__star">*</span> тэмдэгтэйг заавал бөглөнө.</li>
          </ul>
        </div>

        <div class="gks-essay__actions">
          <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="started = true">Эхлэх</DsButton>
          <DsButton variant="ghost" @click="choosingLevel = true">Түвшин солих</DsButton>
        </div>
      </section>

      <!-- ── 3. The form ────────────────────────────────────────── -->
      <template v-else-if="definition">
        <header class="gks-essay__formhead">
          <div>
            <p class="gks-eyebrow">GKS тэтгэлэг · {{ QUESTIONNAIRE_LEVEL_LABELS[definition.level] }}</p>
            <h1 class="gks-essay__h2">{{ definition.title }}</h1>
          </div>
        </header>

        <DsCard v-if="view.questionnaire?.reopenNote" accent>
          <p class="gks-essay__reopen">
            <DsIcon name="message-square-warning" :size="18" />
            <span><strong>Мэргэжилтний тэмдэглэл:</strong> {{ view.questionnaire.reopenNote }}</span>
          </p>
        </DsCard>

        <QuestionnaireForm
          v-model:answers="answers"
          :definition="definition"
          :save-state="autosave.state.value"
          :saved-at="autosave.savedAt.value"
          :save-error="autosave.errorMessage.value"
          :submitting="submitting"
          :step-key="`essay:${caseId}`"
          submit-label="Мэргэжилтэнд илгээх"
          @change="autosave.touch()"
          @step="autosave.flush()"
          @submit="submit"
        />
        <p v-if="submitError" class="gks-essay__error">{{ submitError }}</p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-essay { display: flex; flex-direction: column; gap: var(--sp-5); max-width: 1120px; }
.gks-essay__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-essay__back:hover { color: var(--brand-600); }
.gks-essay__skeleton { height: 420px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }

.gks-essay__intro {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  max-width: 720px;
  padding: var(--sp-7);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.gks-essay__h1 { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); line-height: var(--lh-heading); }
.gks-essay__h2 { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-essay__lead { color: var(--text-body); line-height: var(--lh-body); }
.gks-essay__muted { margin-top: var(--sp-4); font-size: var(--fs-body-sm); color: var(--text-muted); }

.gks-essay__levels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-essay__level {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-1);
  padding: var(--sp-5) var(--sp-4) var(--sp-4);
  border: var(--border-hair) solid var(--line-strong);
  border-radius: var(--radius-3);
  background: var(--n-000);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-essay__level:hover { border-color: var(--brand-500); box-shadow: var(--shadow-card); }
.gks-essay__level > :last-child { margin-top: var(--sp-2); color: var(--brand-600); }
.gks-essay__level--suggested { border-color: var(--brand-600); background: var(--brand-025); }
.gks-essay__level-tag { position: absolute; top: calc(var(--sp-3) * -1); left: var(--sp-4); padding: 2px var(--sp-2); border-radius: var(--radius-pill); background: var(--brand-600); color: var(--text-inverse); font-size: var(--fs-micro); font-weight: var(--fw-semibold); }
.gks-essay__level-name { font-family: var(--font-display); font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-essay__level-who { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-essay__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-essay__facts li { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-3); border-radius: var(--radius-2); background: var(--surface-sunken); font-size: var(--fs-body-sm); }
.gks-essay__facts li > :first-child { flex-shrink: 0; color: var(--brand-600); margin-top: 1px; }
.gks-essay__tips { padding: var(--sp-4) var(--sp-5); border-left: var(--border-rail) solid var(--amber-600); background: var(--amber-050); border-radius: 0 var(--radius-2) var(--radius-2) 0; }
.gks-essay__tips-title { font-weight: var(--fw-semibold); color: var(--text-strong); margin-bottom: var(--sp-2); }
.gks-essay__tips ul { display: flex; flex-direction: column; gap: var(--sp-2); padding-left: var(--sp-4); list-style: disc; font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-essay__star { color: var(--red-700); }
.gks-essay__actions { display: flex; gap: var(--sp-3); flex-wrap: wrap; align-items: center; }

.gks-essay__formhead { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--sp-4); }
.gks-essay__reopen { display: flex; gap: var(--sp-3); align-items: flex-start; font-size: var(--fs-body-sm); }
.gks-essay__reopen > :first-child { flex-shrink: 0; color: var(--red-700); margin-top: 2px; }
.gks-essay__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-essay__done { display: flex; gap: var(--sp-4); align-items: flex-start; }
.gks-essay__done-icon { display: grid; place-items: center; flex-shrink: 0; width: 52px; height: 52px; border-radius: 50%; background: var(--success-bg); color: var(--success-fg); }
.gks-essay__next { display: flex; flex-direction: column; gap: var(--sp-3); margin-top: var(--sp-5); padding-left: var(--sp-5); list-style: decimal; font-size: var(--fs-body-sm); color: var(--text-body); }

@media (max-width: 700px) {
  .gks-essay__intro { padding: var(--sp-5); }
  .gks-essay__levels,
  .gks-essay__facts { grid-template-columns: minmax(0, 1fr); }
  .gks-essay__level-tag { top: calc(var(--sp-2) * -1); }
}
</style>
