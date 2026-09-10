<script setup lang="ts">
import type { EnglishLevel, GksBlocker, GksCheckResult, GksDegree, GksStrength, GpaScale } from '@gks/shared';

/**
 * GKS боломжийн шалгуур (1L, ARCHITECTURE.md §3.5).
 *
 * This is the page a Facebook ad lands on, and it exists to defuse one belief:
 * *"Засгийн газрын тэтгэлэг гэдэг чинь — би тэнцэхгүй биз дээ."* Most people
 * who believe it clear the criteria comfortably and have never been told so.
 *
 * Three decisions shape everything below:
 *
 *   - **Шалгуур and материалын хүч are two different answers.** The first is
 *     the guideline's rules, mostly passed; the second is how strong the file
 *     would be today. Blending them would produce either false hope or false
 *     despair, and the layout keeps them in separate cards.
 *   - **Nothing on this page is a number.** No score, no percentage, no points
 *     to add up. A mark is what somebody who arrived afraid of being judged
 *     stops at, and they never reach the advice beside it — so every part is
 *     one of four words and the whole is one of three stages. The weights that
 *     rank the advice stay inside the API (`ARCHITECTURE.md` §3.5).
 *   - **The result is the control panel.** TOPIK and English can be changed on
 *     the answer itself, and the levels move with them — "юу хийвэл боломж
 *     нэмэгдэх вэ" answered by letting somebody watch it happen.
 *   - **Nothing is gated, and nothing is asked twice.** The verdict is free and
 *     the contact form comes after it — a page that withholds the answer until
 *     a phone number is typed is a page nobody trusts with the answer. The four
 *     disqualifiers are on the result rather than in the wizard for the same
 *     reason: they are a correction the rare visitor makes, not a screen
 *     everybody has to clear before seeing anything.
 *
 * The URL carries every answer, so a result survives a reload and a consultant
 * can send one back with one thing changed. Nothing is stored server-side
 * until the visitor asks us to call.
 */
// The answers live in the URL and nowhere else — see `utils/query-state.ts`.
const router = useRouter();
const { str, flag, apply: applyQuery } = useQueryState();

/** Multi-select answers travel as one comma-separated parameter. */
const list = (value: string): string[] =>
  value.split(',').map((part) => part.trim()).filter(Boolean);

const answers = computed(() => ({
  degree: str('degree') as GksDegree | '',
  education: str('education'),
  graduating: flag('graduating'),
  age: str('age'),
  gpa: str('gpa'),
  gpaScale: str('gpaScale', '100') as GpaScale,
  topik: str('topik', '0'),
  english: str('english', 'NONE') as EnglishLevel,
  strengths: list(str('strengths')) as GksStrength[],
  blockers: list(str('blockers')) as GksBlocker[],
}));

/**
 * Why the URL carries a `ready` flag when the planner's does not.
 *
 * The API needs five answers, and the wizard asks two more *after* the last of
 * them. Without a marker the result would appear mid-wizard, over the top of
 * the questions still being asked. `ready=1` is written by the final step, and
 * a shared link carries it, so a sent result still renders server-side.
 */
const isReady = computed(
  () =>
    flag('ready') &&
    Boolean(answers.value.degree) &&
    Boolean(answers.value.education) &&
    Boolean(answers.value.age) &&
    Boolean(answers.value.gpa),
);

/** This wizard has no paging, so nothing is reset when an answer changes. */
function apply(patch: Record<string, string | number | undefined>) {
  applyQuery(patch, false);
}

/* ---------------------------------------------------------------------- *
 * The wizard
 * ---------------------------------------------------------------------- */

const STEP_TITLES = [
  'Ямар түвшинд тэтгэлэг горилох вэ?',
  'Одоогийн боловсрол?',
  'Нас, голч дүн',
  'Хэлний түвшин',
  'Давуу талаа тэмдэглэнэ үү',
] as const;

function firstOpenStep(): number {
  if (!answers.value.degree) return 0;
  if (!answers.value.education) return 1;
  if (!answers.value.age || !answers.value.gpa) return 2;
  return 3;
}

/**
 * The current question lives in the URL, not in a `ref`.
 *
 * The regression this fixes: every answer pushes a history entry, so the phone's
 * back gesture — which is how most people go back, not the button on the card —
 * used to restore the previous URL while the wizard stayed on the question it
 * was already showing. The answer disappeared and the screen did not move, which
 * reads as a page that has frozen.
 *
 * With the step in the query, back and forward move through the wizard exactly
 * as they look like they should, and a link somebody was sent opens on the
 * question they were sent it for.
 */
const step = computed(() => {
  const raw = Number.parseInt(str('step'), 10);
  if (!Number.isFinite(raw)) return firstOpenStep();
  return Math.min(Math.max(raw, 0), STEP_TITLES.length - 1);
});

function goToStep(next: number) {
  apply({ step: Math.min(Math.max(next, 0), STEP_TITLES.length - 1) });
}

const ageInput = ref(answers.value.age);
const gpaInput = ref(answers.value.gpa);
const scaleInput = ref<GpaScale>(answers.value.gpaScale);

const educationValue = computed(() => educationKey(answers.value.education, answers.value.graduating));

function answerDegree(degree: GksDegree) {
  apply({ degree, step: 1 });
}

function answerEducation(key: string) {
  const choice = GKS_EDUCATION_CHOICES.find((row) => row.value === key);
  if (!choice) return;
  apply({ education: choice.education, graduating: choice.graduating ? '1' : undefined, step: 2 });
}

const profileError = ref<string | null>(null);

function answerProfile() {
  const age = Number.parseInt(ageInput.value, 10);
  const gpa = Number.parseFloat(gpaInput.value);
  if (!Number.isFinite(age) || age < 14 || age > 70) {
    profileError.value = 'Насаа 14–70 хооронд оруулна уу.';
    return;
  }
  const max = scaleInput.value === '100' ? 100 : Number.parseFloat(scaleInput.value);
  if (!Number.isFinite(gpa) || gpa <= 0 || gpa > max) {
    profileError.value = `Голч дүнгээ ${scaleInput.value} системд тохируулж оруулна уу.`;
    return;
  }
  profileError.value = null;
  apply({ age, gpa, gpaScale: scaleInput.value, step: 3 });
}

/** Multi-select answers travel as one comma-joined parameter, so the URL stays readable. */
function toggle(key: 'strengths' | 'blockers', value: string) {
  const current = answers.value[key] as string[];
  const next = current.includes(value) ? current.filter((row) => row !== value) : [...current, value];
  apply({ [key]: next.join(',') });
}

function finish() {
  apply({ ready: '1' });
}

function reopen() {
  router.push({ query: {} });
}

/* ---------------------------------------------------------------------- *
 * The answer
 * ---------------------------------------------------------------------- */

const query = computed(() => ({
  degree: answers.value.degree,
  age: answers.value.age,
  education: answers.value.education,
  graduating: answers.value.graduating ? 'true' : 'false',
  gpa: answers.value.gpa,
  gpaScale: answers.value.gpaScale,
  topik: answers.value.topik,
  english: answers.value.english,
  ...(answers.value.strengths.length ? { strengths: answers.value.strengths.join(',') } : {}),
  ...(answers.value.blockers.length ? { blockers: answers.value.blockers.join(',') } : {}),
}));

// Fetched by hand for the same reason the planner's is: between two taps of the
// wizard the URL is half-answered, and firing then sends a request the API can
// only reject. A shared link arrives complete, so it still renders on the server.
const { data: result, status, error, refresh } = await useApiFetch<GksCheckResult>('/gks-eligibility', {
  query,
  lazy: true,
  immediate: isReady.value,
  watch: false,
});

watch(query, () => {
  if (isReady.value) refresh();
});

const verdict = computed(() => result.value?.eligibility.verdict ?? 'PASS');

/**
 * `GksCheckCompleted` (1A-38). Somebody who answered every question about
 * their grades and their Korean is the most qualified audience this site
 * produces — worth an event even though Meta has no standard name for it, and
 * worth carrying the verdict, because "тэнцэх магадлалтай" and "энэ жил
 * болохгүй" are two different people to advertise to.
 *
 * Once per verdict, not once per keystroke: the result panel re-fetches every
 * time a slider on it moves.
 *
 * `immediate` matters here. A shared link arrives with every answer in the URL
 * and renders on the server, so by the time the browser hydrates the result is
 * already sitting there and a plain watcher never sees it change — the most
 * qualified visitor of all would be the one who went uncounted.
 */
const meta = useMetaTracking();
let reportedVerdict: string | null = null;
watch(
  result,
  (value) => {
    if (!value || value.eligibility.verdict === reportedVerdict) return;
    reportedVerdict = value.eligibility.verdict;
    meta.trackCustom('GksCheckCompleted', {
      content_category: value.eligibility.verdict,
      content_name: value.input.education,
    });
  },
  { immediate: true },
);

/** The CTA carries the whole assessment into the consultation form. */
const consultationLink = computed(() => {
  if (!result.value) return '/consultation?service=GKS_SCHOLARSHIP';
  const params = new URLSearchParams({
    service: 'GKS_SCHOLARSHIP',
    note: result.value.consultationNote,
    age: String(result.value.input.age),
    education: result.value.input.education,
    gpa: String(result.value.input.gpa),
    gpaScale: result.value.input.gpaScale,
  });
  if (result.value.input.topik > 0) params.set('topik', String(result.value.input.topik));
  return `/consultation?${params.toString()}`;
});

const socialImage = `${useSiteUrl()}/img/gks-scholarship-og.png`;

useHead({ title: 'GKS тэтгэлэгт хамрагдах боломжоо 1 минутад шалгах' });
useSeoMeta({
  description:
    'Нас, боловсрол, голч дүн, хэлний түвшингээ оруулаад БНСУ-ын Засгийн газрын тэтгэлгийн шалгуурыг ' +
    'хангаж байгаа эсэхээ, материалынхаа хүч болон юуг сайжруулбал боломж нэмэгдэхийг шууд хараарай.',
  ogTitle: 'Та GKS тэтгэлэгт хамрагдах боломжтой юу?',
  ogDescription: '1 минут, 5 асуулт. Шалгуур, материалынхаа хүч, дараагийн алхмууд.',
  ogType: 'website',
  ogImage: socialImage,
  twitterCard: 'summary_large_image',
  twitterImage: socialImage,
});
</script>

<template>
  <div class="gks-check" :class="{ 'gks-check--busy': status === 'pending' }">
    <header class="gks-check__head">
      <span class="gks-eyebrow">GLOBAL KOREA SCHOLARSHIP</span>
      <h1>{{ isReady ? 'Таны боломжийн үнэлгээ' : 'Та GKS тэтгэлэгт хамрагдах боломжтой юу?' }}</h1>
      <p v-if="!isReady" class="gks-check__lede">
        5 асуулт, 1 минут. Шалгуураа хангаж байгаа эсэх, материал чинь өнөөдөр хэр хүчтэй байгаа,
        юуг сайжруулбал боломж хамгийн их нэмэгдэхийг шууд харна.
      </p>
    </header>

    <!-- ── The wizard ─────────────────────────────────────────────────── -->
    <DsCard v-if="!isReady" class="gks-wizard">
      <ol class="gks-wizard__rail" aria-label="Асуултууд">
        <li
          v-for="(title, index) in STEP_TITLES"
          :key="title"
          class="gks-wizard__dot"
          :class="{ 'gks-wizard__dot--on': index <= step }"
        />
      </ol>

      <h2 class="gks-wizard__q">{{ STEP_TITLES[step] }}</h2>

      <PlanChoiceGrid
        v-if="step === 0"
        :choices="GKS_DEGREE_CHOICES"
        :model-value="answers.degree || null"
        :label="STEP_TITLES[0]"
        @update:model-value="answerDegree($event)"
      />

      <PlanChoiceGrid
        v-else-if="step === 1"
        :choices="GKS_EDUCATION_CHOICES"
        :model-value="educationValue || null"
        :label="STEP_TITLES[1]"
        @update:model-value="answerEducation($event)"
      />

      <form v-else-if="step === 2" class="gks-wizard__form" @submit.prevent="answerProfile">
        <div class="gks-wizard__fields">
          <DsInput
            v-model="ageInput"
            label="Нас"
            type="number"
            inputmode="numeric"
            min="14"
            max="70"
            placeholder="19"
            icon-left="user"
          />
          <DsInput
            v-model="gpaInput"
            label="Голч дүн"
            type="number"
            inputmode="decimal"
            step="0.01"
            placeholder="88"
            icon-left="chart-no-axes-column"
            :hint="GPA_FLOOR_HINT[scaleInput]"
          />
          <DsSelect
            v-model="scaleInput"
            label="Дүнгийн систем"
            :options="GPA_SCALE_OPTIONS"
          />
        </div>
        <p v-if="profileError" class="gks-wizard__error">{{ profileError }}</p>
        <DsButton type="submit" icon-right="arrow-right">Үргэлжлүүлэх</DsButton>
      </form>

      <div v-else-if="step === 3" class="gks-wizard__form">
        <div class="gks-wizard__group">
          <p class="gks-wizard__sub">Солонгос хэл (TOPIK)</p>
          <PlanChoiceGrid
            variant="chip"
            label="TOPIK түвшин"
            :choices="GKS_TOPIK_CHOICES"
            :model-value="Number(answers.topik)"
            @update:model-value="apply({ topik: $event })"
          />
        </div>
        <div class="gks-wizard__group">
          <p class="gks-wizard__sub">Англи хэл</p>
          <PlanChoiceGrid
            variant="chip"
            label="Англи хэлний түвшин"
            :choices="GKS_ENGLISH_CHOICES"
            :model-value="answers.english"
            @update:model-value="apply({ english: $event })"
          />
        </div>
        <p class="gks-wizard__note">
          Хэлний түвшин GKS-ийн шалгуур биш. Тэтгэлэг өөрөө 1 жилийн хэлний бэлтгэлийг дотроо агуулдаг.
        </p>
        <DsButton icon-right="arrow-right" @click="goToStep(4)">Үргэлжлүүлэх</DsButton>
      </div>

      <div v-else class="gks-wizard__form">
        <div class="gks-wizard__group">
          <p class="gks-wizard__note">
            Танд хамаарахыг нь тэмдэглээрэй. Аль нь ч байхгүй бол шууд үргэлжлүүлж болно.
          </p>
          <ul class="gks-ticks">
            <li v-for="choice in STRENGTH_CHOICES" :key="choice.value">
              <button
                type="button"
                class="gks-tick"
                :class="{ 'gks-tick--on': answers.strengths.includes(choice.value) }"
                :aria-pressed="answers.strengths.includes(choice.value)"
                @click="toggle('strengths', choice.value)"
              >
                <DsIcon :name="answers.strengths.includes(choice.value) ? 'circle-check' : choice.icon" :size="18" />
                <span>
                  {{ choice.label }}
                  <small v-if="choice.hint">{{ choice.hint }}</small>
                </span>
              </button>
            </li>
          </ul>
        </div>

        <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="finish">
          Үр дүнгээ харах
        </DsButton>
      </div>

      <footer v-if="step > 0" class="gks-wizard__foot">
        <DsButton variant="ghost" size="sm" icon-left="chevron-left" @click="goToStep(step - 1)">Буцах</DsButton>
      </footer>
    </DsCard>

    <!-- ── The answer ─────────────────────────────────────────────────── -->
    <template v-else>
      <!-- A silent grey rectangle is what an unreachable API used to look like
           here: no message, no way out. A failure has to say so and offer the
           one button that fixes most of them. -->
      <DsCard v-if="error || (status !== 'pending' && !result)" accent class="gks-check__state">
        <p>Үнэлгээ гаргахад алдаа гарлаа. Дахин оролдоод үзээрэй.</p>
        <div class="gks-check__state-actions">
          <DsButton icon-left="rotate-cw" @click="refresh()">Дахин оролдох</DsButton>
          <DsButton variant="ghost" icon-left="rotate-ccw" @click="reopen">Дахин бөглөх</DsButton>
        </div>
      </DsCard>

      <div v-else-if="!result" class="gks-check__skeleton">
        <span>Үнэлгээг бодож байна…</span>
      </div>

      <template v-else>
        <!-- The verdict. One sentence, and the honest second sentence under it. -->
        <section class="gks-verdict" :class="`gks-verdict--${VERDICT_TONE[verdict]}`">
          <DsIcon :name="VERDICT_ICON[verdict]" :size="30" />
          <div>
            <h2>{{ result.eligibility.headlineMn }}</h2>
            <p>{{ result.eligibility.summaryMn }}</p>
            <DsButton
              v-if="result.suggestedDegree"
              variant="ghost"
              size="sm"
              icon-right="arrow-right"
              @click="apply({ degree: result.suggestedDegree })"
            >
              {{ GKS_DEGREE_GENITIVE[result.suggestedDegree] }} тэтгэлгээр шалгах
            </DsButton>
          </div>
          <DsButton variant="ghost" size="sm" icon-left="rotate-ccw" class="gks-verdict__redo" @click="reopen">
            Дахин шалгах
          </DsButton>
        </section>

        <div class="gks-check__grid">
          <div class="gks-check__main">
            <!-- How strong the file is, and the panel that moves it. -->
            <DsCard>
              <div class="gks-strength">
                <GksStrengthMeter :band="result.readiness.band" :label="result.readiness.labelMn" />
                <div class="gks-strength__body">
                  <h2 class="gks-check__h2">Материал чинь өнөөдөр хэр хүчтэй вэ</h2>
                  <p class="gks-strength__summary">{{ result.readiness.summaryMn }}</p>
                  <ul class="gks-factors">
                    <li v-for="factor in result.readiness.factors" :key="factor.key">
                      <div class="gks-factors__top">
                        <strong>{{ factor.labelMn }}</strong>
                        <span class="gks-factors__value">{{ factor.valueMn }}</span>
                        <span class="gks-factors__level" :class="`gks-factors__level--${FACTOR_LEVEL_TONE[factor.level]}`">
                          {{ factor.levelMn }}
                        </span>
                      </div>
                      <div class="gks-factors__bar" :class="`gks-factors__bar--${FACTOR_LEVEL_TONE[factor.level]}`" aria-hidden="true">
                        <span
                          v-for="segment in 3"
                          :key="segment"
                          :class="{ 'gks-factors__seg--on': segment <= FACTOR_LEVEL_SEGMENTS[factor.level] }"
                        />
                      </div>
                      <small>{{ factor.noteMn }}</small>
                    </li>
                  </ul>
                </div>
              </div>

              <!-- "Хэрэв би…" — the same chips as the wizard, on the answer, so
                   somebody can watch the levels move instead of reading about it. -->
              <div class="gks-whatif">
                <p class="gks-whatif__title">
                  <DsIcon name="sliders-horizontal" :size="16" />
                  Хэрэв би хэлээ ахиулбал?
                </p>
                <PlanChoiceGrid
                  variant="chip"
                  label="TOPIK түвшин"
                  :choices="GKS_TOPIK_CHOICES"
                  :model-value="result.input.topik"
                  @update:model-value="apply({ topik: $event })"
                />
                <PlanChoiceGrid
                  variant="chip"
                  label="Англи хэлний түвшин"
                  :choices="GKS_ENGLISH_CHOICES"
                  :model-value="result.input.english"
                  @update:model-value="apply({ english: $event })"
                />
              </div>
            </DsCard>

            <!-- What to do next, biggest move first. -->
            <DsCard v-if="result.improvements.length" title="Боломжоо нэмэгдүүлэх дараагийн алхмууд">
              <ol class="gks-moves">
                <li v-for="move in result.improvements" :key="move.factor + move.titleMn">
                  <span class="gks-moves__gain" :class="`gks-moves__gain--${IMPACT_TONE[move.impact]}`">
                    {{ move.impactMn }}
                  </span>
                  <div>
                    <strong>{{ move.titleMn }}</strong>
                    <p>{{ move.detailMn }}</p>
                    <small v-if="move.effortMn">
                      <DsIcon name="clock" :size="13" /> {{ move.effortMn }}
                    </small>
                  </div>
                </li>
              </ol>
            </DsCard>

            <!-- The dual track. The answer to the fear the visitor arrived with. -->
            <DsCard accent class="gks-dual">
              <h2 class="gks-check__h2">Тэнцэхгүй бол яах вэ?</h2>
              <p class="gks-dual__lede">
                Бидний ажлын гол зарчим: тэтгэлгийн материалыг илгээхийн зэрэгцээ үндсэн ангийн
                элсэлтэд давхар мэдүүлдэг. Тэтгэлэгт тэнцвэл тэтгэлгээрээ, тэнцэхгүй бол мөн адил
                тэр улиралдаа Солонгос руу явна.
              </p>
              <div class="gks-dual__lines">
                <div class="gks-dual__line">
                  <span class="gks-dual__tag">Тэтгэлгийн зам</span>
                  <strong>{{ result.dualTrack.scholarship.labelMn }}</strong>
                  <p class="gks-tnum">
                    {{ formatFee(result.dualTrack.scholarship.totalAmount) }}
                    <small>· урьдчилгаа {{ formatFee(result.dualTrack.scholarship.prepaymentAmount) }}</small>
                  </p>
                  <small>Үлдэгдэл: {{ result.dualTrack.scholarship.balanceWhenMn }}</small>
                </div>
                <div class="gks-dual__line">
                  <span class="gks-dual__tag">Нөөц зам</span>
                  <strong>{{ result.dualTrack.regular.labelMn }}</strong>
                  <p class="gks-tnum">
                    {{ formatFee(result.dualTrack.regular.totalAmount) }}
                    <small>· урьдчилгаа {{ formatFee(result.dualTrack.regular.prepaymentAmount) }}</small>
                  </p>
                  <small>Үлдэгдэл: {{ result.dualTrack.regular.balanceWhenMn }}</small>
                </div>
              </div>
              <ul class="gks-dual__points">
                <li v-if="result.dualTrack.noExtraFee">
                  <DsIcon name="circle-check" :size="16" />
                  <span>
                    Тэтгэлгийн үйлчлүүлэгч үндсэн ангийн зуучлалд
                    <strong>нэмэлт зуучлалын төлбөргүй</strong> давхар хамрагдана.
                  </span>
                </li>
                <li>
                  <DsIcon name="circle-check" :size="16" />
                  <span>
                    Тэтгэлгийн үлдэгдэл төлбөрийг зөвхөн
                    <strong>тэтгэлэгт тэнцсэний дараа</strong> төлнө.
                  </span>
                </li>
                <li>
                  <DsIcon name="circle-check" :size="16" />
                  <span>Хоёр замын материалын ихэнх нь давхцдаг тул нэг удаагийн бэлтгэлээр хоёуланд нь мэдүүлнэ.</span>
                </li>
              </ul>
            </DsCard>

            <!-- The ask. After the answer, never before it. -->
            <section class="gks-cta">
              <h2>Материалаа хэзээ эхлэх вэ?</h2>
              <p>
                Таны хариултууд бэлэн байна. Зөвлөх тань үүн дээр тулгуурлаад ямар сургууль,
                ямар материалаас эхлэхийг тодорхой хэлж өгнө.
              </p>
              <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo(consultationLink)">
                Үнэлгээгээ зөвлөхөд илгээх
              </DsButton>
              <small>Үнэ төлбөргүй. Таны хариултууд аль хэдийн бөглөгдсөн байна.</small>
            </section>
          </div>

          <aside class="gks-check__side">
            <DsCard title="Шалгуур бүрээр">
              <ul class="gks-criteria">
                <li v-for="row in result.eligibility.criteria" :key="row.key">
                  <DsIcon
                    :name="CRITERION_ICON[String(row.met) as keyof typeof CRITERION_ICON]"
                    :size="17"
                    :class="`gks-criteria__icon gks-criteria__icon--${String(row.met)}`"
                  />
                  <div>
                    <strong>{{ row.labelMn }}</strong>
                    <p class="gks-criteria__req">{{ row.requirementMn }}</p>
                    <p class="gks-criteria__value">{{ row.valueMn }}</p>
                    <p v-if="row.adviceMn" class="gks-criteria__advice">{{ row.adviceMn }}</p>
                  </div>
                </li>
              </ul>

              <!-- The four disqualifiers used to be a wizard step, and asking a
                   visitor to work through a screen of them before seeing any
                   answer is asking most people to tick nothing. They belong
                   here instead: beside the three rows they decide, after the
                   answer, as a correction somebody makes only if it applies. -->
              <div class="gks-criteria__ask">
                <p>Эдгээрийн аль нэг нь танд хамаарах бол тэмдэглээрэй — шалгуур шууд шинэчлэгдэнэ.</p>
                <ul class="gks-ticks">
                  <li v-for="choice in BLOCKER_CHOICES" :key="choice.value">
                    <button
                      type="button"
                      class="gks-tick gks-tick--sm gks-tick--stop"
                      :class="{ 'gks-tick--on': answers.blockers.includes(choice.value) }"
                      :aria-pressed="answers.blockers.includes(choice.value)"
                      @click="toggle('blockers', choice.value)"
                    >
                      <DsIcon
                        :name="answers.blockers.includes(choice.value) ? 'circle-check' : choice.icon"
                        :size="16"
                      />
                      <span>{{ choice.label }}</span>
                    </button>
                  </li>
                </ul>
              </div>
            </DsCard>

            <DsCard title="Дараагийн мэдүүлэг">
              <p class="gks-round__when gks-tnum">
                {{ formatMonth(result.round.applyFromYear, result.round.applyFromMonth) }}
                <span v-if="result.round.applyToMonth !== result.round.applyFromMonth">
                  – {{ result.round.applyToMonth }}-р сар
                </span>
              </p>
              <p v-if="result.round.isOpenNow" class="gks-round__open">
                <DsIcon name="circle-alert" :size="15" />
                Мэдүүлгийн хугацаа нээлттэй — энэ улиралд амжихын тулд яаралтай эхлэх шаардлагатай.
              </p>
              <p v-else class="gks-round__days">
                <DsIcon name="calendar-days" :size="15" />
                <strong class="gks-tnum">{{ result.round.daysToApply }}</strong> хоногийн дараа нээгдэнэ
              </p>
              <ul class="gks-round__rail">
                <!-- Once the window is open the preparation month is behind us,
                     and printing a past date as a plan reads as a mistake. -->
                <li v-if="!result.round.isOpenNow">
                  <span>Материал эхлэх</span>
                  <strong>{{ formatMonth(result.round.prepareFromYear, result.round.prepareFromMonth) }}</strong>
                </li>
                <li>
                  <span>Мэдүүлэг</span>
                  <strong>{{ formatMonth(result.round.applyFromYear, result.round.applyFromMonth) }}</strong>
                </li>
                <li>
                  <span>Солонгост элсэх</span>
                  <strong>{{ formatMonth(result.round.entryYear, result.round.entryMonth) }}</strong>
                </li>
              </ul>
              <p v-if="result.round.isEstimated" class="gks-round__note">
                Жил бүрийн хуанлиар тооцсон ойролцоо хугацаа. Албан ёсны огноо тухайн жилийн
                зарлалаар тодорхой болно.
              </p>
            </DsCard>

            <DsCard :title="`Танд тохирох зам: ${result.track.labelMn}`">
              <p class="gks-track__reason">{{ result.track.reasonMn }}</p>
              <p class="gks-track__choices">
                <DsIcon name="landmark" :size="15" />
                <strong class="gks-tnum">{{ result.track.choices }}</strong> сургууль сонгох боломжтой
              </p>
              <NuxtLink to="/gks-scholarship" class="gks-track__link">
                Тэтгэлгийн талаар дэлгэрэнгүй <DsIcon name="arrow-right" :size="14" />
              </NuxtLink>
            </DsCard>

            <p class="gks-check__disclaimer">
              Энэ үнэлгээ нь GKS-ийн нийтэд зарласан ерөнхий шалгуур болон манай байгууллагын
              туршлагад тулгуурласан урьдчилсан тооцоо юм. Албан ёсны шалгаруулалтыг БНСУ-ын
              Засгийн газар (NIIED) хийнэ.
            </p>
          </aside>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-check {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  max-width: 1120px;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-5) var(--sp-11);
}

.gks-check--busy {
  opacity: 0.72;
  transition: opacity var(--transition-control);
}

.gks-check__head h1 {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  line-height: var(--lh-heading);
  letter-spacing: var(--ls-heading);
  margin: var(--sp-2) 0 0;
}

.gks-check__lede {
  max-width: 62ch;
  margin: var(--sp-3) 0 0;
  color: var(--text-subtle);
  font-size: var(--fs-body-lg);
  line-height: var(--lh-body);
}

.gks-check__h2 {
  font-size: var(--fs-h3);
  font-family: var(--font-display);
  letter-spacing: var(--ls-heading);
  margin: 0 0 var(--sp-2);
}

/* ---- Wizard ---- */

.gks-wizard__rail {
  display: flex;
  gap: var(--sp-2);
  list-style: none;
  margin: 0 0 var(--sp-5);
  padding: 0;
}

.gks-wizard__dot {
  height: 3px;
  flex: 1;
  border-radius: var(--radius-pill);
  background: var(--line-hairline);
}

.gks-wizard__dot--on {
  background: var(--line-accent);
}

.gks-wizard__q {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  letter-spacing: var(--ls-heading);
  margin: 0 0 var(--sp-4);
}

.gks-wizard__form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  align-items: flex-start;
}

.gks-wizard__fields {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp-4);
  width: 100%;
  align-items: start;
}

.gks-wizard__group {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.gks-wizard__sub {
  margin: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
}

.gks-wizard__note,
.gks-wizard__error {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

.gks-wizard__error {
  color: var(--danger-fg);
}

.gks-wizard__foot {
  margin-top: var(--sp-5);
}

.gks-ticks {
  display: grid;
  gap: var(--sp-2);
  list-style: none;
  margin: 0;
  padding: 0;
}

.gks-tick {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  width: 100%;
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  color: var(--text-body);
  font-family: var(--font-sans);
  font-size: var(--fs-body-sm);
  text-align: left;
  cursor: pointer;
  transition: var(--transition-control);
}

.gks-tick span {
  display: flex;
  flex-direction: column;
}

.gks-tick small {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.gks-tick:hover {
  border-color: var(--line-strong);
  background: var(--surface-hover);
}

.gks-tick--on,
.gks-tick--on:hover {
  border-color: var(--line-accent);
  background: var(--surface-selected);
  color: var(--text-accent);
}

.gks-tick--stop.gks-tick--on,
.gks-tick--stop.gks-tick--on:hover {
  border-color: var(--danger-line);
  background: var(--danger-bg);
  color: var(--danger-fg);
}

.gks-tick:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* ---- Verdict ---- */

.gks-verdict {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-6);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}

.gks-verdict h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  letter-spacing: var(--ls-heading);
  margin: 0;
}

.gks-verdict p {
  margin: var(--sp-2) 0 0;
  color: var(--text-subtle);
  line-height: var(--lh-body);
  max-width: 72ch;
}

.gks-verdict__redo {
  margin-left: auto;
  flex: none;
}

.gks-verdict--ok { border-color: var(--success-line); background: var(--success-bg); }
.gks-verdict--ok > svg { color: var(--success-fg); }
.gks-verdict--warn { border-color: var(--warning-line); background: var(--warning-bg); }
.gks-verdict--warn > svg { color: var(--warning-fg); }
.gks-verdict--stop { border-color: var(--info-line); background: var(--info-bg); }
.gks-verdict--stop > svg { color: var(--info-fg); }

/* ---- Layout ---- */

.gks-check__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 1fr);
  gap: var(--sp-5);
  align-items: start;
}

.gks-check__main,
.gks-check__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
}

.gks-check__skeleton {
  display: grid;
  place-items: center;
  height: 380px;
  border-radius: var(--radius-3);
  background: var(--surface-hover);
  color: var(--text-subtle);
  font-size: var(--fs-body-sm);
}

.gks-check__state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin-top: var(--sp-4);
}

/* ---- Score ---- */

.gks-strength {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
}

.gks-strength__body {
  min-width: 0;
}

.gks-strength__summary {
  margin: 0 0 var(--sp-4);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

.gks-factors {
  display: grid;
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

.gks-factors__top {
  display: flex;
  align-items: baseline;
  gap: var(--sp-2);
  font-size: var(--fs-body-sm);
}

.gks-factors__value {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.gks-factors__level {
  margin-left: auto;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
  white-space: nowrap;
}

.gks-factors__level--ok { background: var(--success-bg); color: var(--success-fg); }
.gks-factors__level--mid { background: var(--surface-selected); color: var(--text-accent); }
.gks-factors__level--low { background: var(--warning-bg); color: var(--warning-fg); }
.gks-factors__level--none { background: var(--n-050); color: var(--text-subtle); }

/* Three segments, matching the three words — a bar filled to a percentage
   would put back the number the page deliberately dropped. */
.gks-factors__bar {
  display: flex;
  gap: var(--sp-1);
  margin: var(--sp-2) 0 var(--sp-1);
}

.gks-factors__bar span {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--line-hairline);
  transition: background var(--transition-control);
}

.gks-factors__bar--ok .gks-factors__seg--on { background: var(--success-fg); }
.gks-factors__bar--mid .gks-factors__seg--on { background: var(--line-accent); }
.gks-factors__bar--low .gks-factors__seg--on { background: var(--warning-fg); }

.gks-factors small {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.gks-whatif {
  margin-top: var(--sp-6);
  padding-top: var(--sp-5);
  border-top: var(--border-hair) solid var(--line-hairline);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.gks-whatif__title {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
}

/* ---- Moves ---- */

.gks-moves {
  display: grid;
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: move;
}

.gks-moves li {
  display: flex;
  gap: var(--sp-4);
  align-items: flex-start;
}

.gks-moves__gain {
  /* One width for all four, so the titles line up: a ragged left edge reads as
     four unrelated cards rather than one ordered list. */
  flex: none;
  width: 146px;
  align-self: flex-start;
  text-align: center;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius-pill);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-label);
  white-space: nowrap;
}

.gks-moves__gain--high { background: var(--surface-selected); color: var(--text-accent); }
.gks-moves__gain--mid { background: var(--n-050); color: var(--text-body); }
.gks-moves__gain--low { background: var(--n-050); color: var(--text-subtle); }

.gks-moves strong {
  display: block;
  font-size: var(--fs-body);
}

.gks-moves p {
  margin: var(--sp-1) 0 var(--sp-2);
  color: var(--text-subtle);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.gks-moves small {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

/* ---- Dual track ---- */

.gks-dual__lede {
  margin: 0 0 var(--sp-5);
  line-height: var(--lh-body);
  max-width: 72ch;
}

.gks-dual__lines {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--sp-4);
}

.gks-dual__line {
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  background: var(--surface-card);
}

.gks-dual__line strong {
  display: block;
  font-size: var(--fs-body);
}

.gks-dual__tag {
  display: block;
  margin-bottom: var(--sp-2);
  font-size: var(--fs-micro);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}

.gks-dual__line p {
  margin: var(--sp-2) 0 var(--sp-1);
  font-weight: var(--fw-semibold);
  font-variant-numeric: var(--num-tabular);
}

.gks-dual__line p small,
.gks-dual__line > small {
  font-weight: var(--fw-regular);
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

.gks-dual__points {
  display: grid;
  gap: var(--sp-2);
  list-style: none;
  margin: var(--sp-5) 0 0;
  padding: 0;
}

.gks-dual__points li {
  display: flex;
  gap: var(--sp-2);
  align-items: flex-start;
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

.gks-dual__points svg {
  flex: none;
  margin-top: 3px;
  color: var(--success-fg);
}

/* ---- CTA ---- */

.gks-cta {
  padding: var(--sp-7) var(--sp-6);
  border-radius: var(--radius-3);
  background: var(--surface-inverse, var(--n-900));
  color: var(--text-on-inverse, #fff);
  text-align: center;
}

.gks-cta h2 {
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  margin: 0 0 var(--sp-2);
  /* The global sheet colours headings; on an inverse panel that is invisible. */
  color: inherit;
}

.gks-cta p {
  margin: 0 auto var(--sp-5);
  max-width: 52ch;
  opacity: 0.86;
  line-height: var(--lh-body);
}

.gks-cta small {
  display: block;
  margin-top: var(--sp-3);
  font-size: var(--fs-caption);
  opacity: 0.7;
}

/* ---- Criteria ---- */

.gks-criteria {
  display: grid;
  gap: var(--sp-4);
  list-style: none;
  margin: 0;
  padding: 0;
}

.gks-criteria li {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
}

.gks-criteria__icon {
  flex: none;
  margin-top: 2px;
}

.gks-criteria__icon--true { color: var(--success-fg); }
.gks-criteria__icon--false { color: var(--danger-fg); }
.gks-criteria__icon--null { color: var(--warning-fg); }

.gks-criteria strong {
  font-size: var(--fs-body-sm);
}

.gks-criteria__req,
.gks-criteria__value,
.gks-criteria__advice {
  margin: 2px 0 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.gks-criteria__req {
  color: var(--text-subtle);
}

.gks-criteria__value {
  font-weight: var(--fw-semibold);
}

.gks-criteria__advice {
  margin-top: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-1);
  background: var(--surface-hover);
  color: var(--text-body);
}

.gks-criteria__ask {
  margin-top: var(--sp-5);
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
}

.gks-criteria__ask > p {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

.gks-tick--sm {
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-caption);
}

/* ---- Round ---- */

.gks-round__when {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-variant-numeric: var(--num-tabular);
}

.gks-round__days,
.gks-round__open {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: var(--sp-2) 0 var(--sp-4);
  font-size: var(--fs-body-sm);
  color: var(--text-subtle);
}

.gks-round__open {
  color: var(--warning-fg);
}

.gks-round__rail {
  display: grid;
  gap: var(--sp-3);
  list-style: none;
  margin: 0;
  padding: var(--sp-4) 0 0;
  border-top: var(--border-hair) solid var(--line-hairline);
}

.gks-round__rail li {
  display: flex;
  justify-content: space-between;
  gap: var(--sp-3);
  font-size: var(--fs-body-sm);
}

.gks-round__rail span {
  color: var(--text-subtle);
}

.gks-round__rail strong {
  font-variant-numeric: var(--num-tabular);
}

.gks-round__note {
  margin: var(--sp-4) 0 0;
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

/* ---- Track ---- */

.gks-track__reason {
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-body-sm);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

.gks-track__choices {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-3);
  font-size: var(--fs-body-sm);
}

.gks-track__link {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-accent);
  text-decoration: none;
}

.gks-check__disclaimer {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  line-height: var(--lh-body);
}

@media (max-width: 900px) {
  .gks-check {
    padding: var(--sp-6) var(--sp-4) var(--sp-10);
  }

  .gks-check__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .gks-check__head h1 {
    font-size: var(--fs-h2);
  }

  .gks-wizard__fields {
    grid-template-columns: 1fr;
  }

  .gks-verdict {
    flex-wrap: wrap;
    padding: var(--sp-5);
  }

  .gks-verdict__redo {
    margin-left: 0;
  }

  .gks-moves li {
    flex-direction: column;
    gap: var(--sp-2);
  }

  .gks-moves__gain {
    width: auto;
    padding-inline: var(--sp-3);
  }
}
</style>
