<script setup lang="ts">
import { STUDY_PLAN_GOALS } from '@gks/shared';
import type {
  EducationLevel,
  ProgramLevel,
  StudyPlanResult,
  TopikLevel,
} from '@gks/shared';

/**
 * Суралцах төлөвлөгөө — the study planner (1J, ARCHITECTURE.md §3.4).
 *
 * Most people arrive at this business with a destination and no plan: they know
 * they want to study in Korea and not when they could go, what they would have
 * to clear, where, or what it costs. Four taps in, this page answers all four
 * from the catalogue itself rather than from marketing copy.
 *
 * Two things shape the design:
 *
 *   - **Nothing is typed.** Every question is a choice, because the visitor who
 *     needs this page most is the one who does not yet know the vocabulary to
 *     type into a search box.
 *   - **The answer is the control panel.** Region, budget and TOPIK are changed
 *     on the result, not back in the form — "яг ижил төлөвлөгөө, гэхдээ Пусанд"
 *     is one tap, and the whole answer re-runs.
 *
 * The URL is the state throughout, so a plan survives a reload and a consultant
 * can send one to a client as a link. Nothing is stored server-side.
 */
// The answers live in the URL and nowhere else — see `utils/query-state.ts`.
const router = useRouter();
const { str, apply: applyQuery } = useQueryState();

const answers = computed(() => ({
  education: str('education') as EducationLevel | '',
  goal: str('goal') as ProgramLevel | '',
  topik: str('topik'),
  field: str('field'),
  region: str('region'),
  budget: str('budget'),
}));

/**
 * "Хараахан шийдээгүй" is an answer, and the URL has to be able to say so:
 * an absent `field` means the question has not been asked yet, `any` means it
 * was asked and the visitor has no preference. Without the distinction the
 * fourth question is skipped the moment the third is answered.
 */
const ANY_FIELD = 'any';

const isAnswered = computed(
  () =>
    Boolean(answers.value.education) &&
    Boolean(answers.value.goal) &&
    answers.value.topik !== '' &&
    answers.value.field !== '',
);

/** This wizard has no paging, so nothing is reset when an answer changes. */
function apply(patch: Record<string, string | number | undefined>) {
  applyQuery(patch, false);
}

/* ---------------------------------------------------------------------- *
 * The wizard
 * ---------------------------------------------------------------------- */

/** A half-answered link resumes at the first question still open. */
function firstOpenStep(): number {
  if (!answers.value.education) return 0;
  if (!answers.value.goal) return 1;
  if (answers.value.topik === '') return 2;
  return 3;
}

const step = ref(firstOpenStep());
const STEP_TITLES = [
  'Та одоо ямар боловсролтой вэ?',
  'Солонгост юу сурах вэ?',
  'Солонгос хэлний түвшин?',
  'Ямар чиглэлээр?',
] as const;

/** Only the goals this person's diploma actually reaches (the API re-checks). */
const goalChoices = computed(() => {
  const education = answers.value.education;
  if (!education) return GOAL_CHOICES;
  const allowed = STUDY_PLAN_GOALS[education];
  return GOAL_CHOICES.filter((choice) => allowed.includes(choice.value));
});

/**
 * The fourth question is a word, not a menu.
 *
 * A menu of subjects is a vocabulary somebody has to maintain, and it was never
 * the vocabulary a visitor used: they say "IT", "маркетинг", "경영". The word
 * goes to the same search the catalogue runs, so the plan and the "бүх ангийг
 * харах" link it ends with can never disagree about how many programmes exist.
 */
const fieldInput = ref(answers.value.field === ANY_FIELD ? '' : answers.value.field);
watch(() => answers.value.field, (value) => {
  fieldInput.value = value === ANY_FIELD ? '' : value;
});

function answerField() {
  answerStep('field', fieldInput.value.trim() || ANY_FIELD);
}

function answerStep(key: 'education' | 'goal' | 'topik' | 'field', value: string | number) {
  // A different diploma can invalidate the goal already chosen — drop it rather
  // than plan somebody towards a degree they cannot apply to.
  const patch: Record<string, string | number | undefined> =
    key === 'education' ? { education: value, goal: '', field: '' } : { [key]: value };
  apply(patch);
  if (step.value < STEP_TITLES.length - 1) step.value += 1;
}

function reopenWizard() {
  step.value = 0;
  router.push({ query: {} });
}

/* ---------------------------------------------------------------------- *
 * The answer
 * ---------------------------------------------------------------------- */

const query = computed(() => ({
  education: answers.value.education,
  goal: answers.value.goal,
  topik: answers.value.topik || '0',
  ...(answers.value.field && answers.value.field !== ANY_FIELD ? { field: answers.value.field } : {}),
  ...(answers.value.region ? { region: answers.value.region } : {}),
  ...(answers.value.budget ? { budget: answers.value.budget } : {}),
}));

/**
 * Fetched by hand rather than by the automatic query watcher: between two taps
 * of the wizard the URL is half-answered, and letting it fire then would send a
 * request the API can only reject. A shared link arrives fully answered, so it
 * still renders server-side.
 */
const { data: plan, status, error, refresh } = await useApiFetch<StudyPlanResult>('/study-plan', {
  query,
  lazy: true,
  immediate: isAnswered.value,
  watch: false,
});

watch(query, () => {
  if (isAnswered.value) refresh();
});

const departure = computed(() => plan.value?.departure ?? null);
const firstStage = computed(() => plan.value?.stages[0] ?? null);

/** The region chips: whatever the current match set actually spans, plus "all". */
const regionChoices = computed(() => [
  { value: '', label: 'Бүх хот', icon: 'map' },
  ...(plan.value?.schools.regions ?? []).map((row) => ({
    value: row.value,
    label: row.label,
    icon: 'map-pin',
  })),
]);

const regionCounts = computed(() =>
  Object.fromEntries((plan.value?.schools.regions ?? []).map((row) => [row.value, row.count])),
);

const budgetChoices = computed(() =>
  BUDGET_CHOICES.map((row) => ({ ...row, icon: row.value ? 'wallet' : 'infinity' })),
);

/** "Бүх ангийг харах" — the same filters, handed to the catalogue. */
const catalogueLink = computed(() => {
  const params = new URLSearchParams();
  if (plan.value) {
    params.set('level', plan.value.input.goal);
    if (plan.value.input.field) params.set('field', plan.value.input.field);
    if (plan.value.input.region) params.set('region', plan.value.input.region);
    if (plan.value.input.budgetKrw) params.set('tuitionMax', String(plan.value.input.budgetKrw));
  }
  return `/programs?${params.toString()}`;
});

/** The CTA carries the whole plan into the consultation form. */
const consultationLink = computed(() => {
  if (!plan.value) return '/consultation';
  const params = new URLSearchParams({
    service: plan.value.serviceType,
    note: plan.value.consultationNote,
  });
  return `/consultation?${params.toString()}`;
});

const REQUIREMENT_ICON = { true: 'circle-check', false: 'circle-alert', null: 'circle-dashed' } as const;

useHead({ title: 'Суралцах төлөвлөгөө — хэзээ, хаана, хэдэн төгрөгөөр' });
useSeoMeta({
  description:
    'Боловсрол, TOPIK түвшин, мэргэжлээ сонгоод Солонгост хэзээ очих боломжтойгоо, ямар сургуулиуд ' +
    'нээлттэйг, эхний жилд хэдэн төгрөг зарцуулахаа хараарай. Дөрвөн асуулт, бүрэн төлөвлөгөө.',
  ogTitle: 'Суралцах төлөвлөгөө · GKS Edu',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-plan-page" :class="{ 'gks-plan-page--busy': status === 'pending' }">
    <header class="gks-plan-page__head">
      <span class="gks-eyebrow">Суралцах төлөвлөгөө</span>
      <h1 class="gks-plan-page__title">
        {{ isAnswered ? 'Таны төлөвлөгөө' : 'Хэзээ, хаана, хэдэн төгрөгөөр?' }}
      </h1>
      <p v-if="!isAnswered" class="gks-plan-page__lede">
        Дөрвөн асуултад хариулаад л болно. Бичих зүйлгүй.
      </p>
    </header>

    <!-- ── The wizard ─────────────────────────────────────────────────── -->
    <DsCard v-if="!isAnswered" class="gks-wizard">
      <ol class="gks-wizard__rail" aria-label="Асуултууд">
        <li
          v-for="(title, index) in STEP_TITLES"
          :key="title"
          :class="{ 'gks-wizard__dot--on': index <= step }"
          class="gks-wizard__dot"
        />
      </ol>

      <h2 class="gks-wizard__q">{{ STEP_TITLES[step] }}</h2>

      <PlanChoiceGrid
        v-if="step === 0"
        :choices="EDUCATION_CHOICES"
        :model-value="answers.education || null"
        :label="STEP_TITLES[0]"
        @update:model-value="answerStep('education', $event)"
      />
      <PlanChoiceGrid
        v-else-if="step === 1"
        :choices="goalChoices"
        :model-value="answers.goal || null"
        :label="STEP_TITLES[1]"
        @update:model-value="answerStep('goal', $event)"
      />
      <PlanChoiceGrid
        v-else-if="step === 2"
        :choices="TOPIK_CHOICES"
        :model-value="answers.topik === '' ? null : (Number(answers.topik) as TopikLevel)"
        :label="STEP_TITLES[2]"
        @update:model-value="answerStep('topik', $event)"
      />
      <form v-else class="gks-wizard__field" @submit.prevent="answerField">
        <DsInput
          v-model="fieldInput"
          :label="STEP_TITLES[3]"
          placeholder="IT, маркетинг, 경영…"
          icon-left="search"
          hint="Мэргэжлийнхээ нэрийг бичнэ үү. Шийдээгүй бол алгасаад цааш үргэлжлүүлж болно."
        />
        <div class="gks-wizard__field-actions">
          <DsButton type="submit" icon-right="arrow-right">Үргэлжлүүлэх</DsButton>
          <DsButton variant="ghost" type="button" @click="answerStep('field', ANY_FIELD)">
            Хараахан шийдээгүй
          </DsButton>
        </div>
      </form>

      <footer v-if="step > 0" class="gks-wizard__foot">
        <DsButton variant="ghost" size="sm" icon-left="chevron-left" @click="step -= 1">Буцах</DsButton>
      </footer>
    </DsCard>

    <!-- ── The answer ─────────────────────────────────────────────────── -->
    <template v-else>
      <DsCard v-if="error" accent class="gks-plan-page__state">
        Төлөвлөгөө гаргахад алдаа гарлаа. Хуудсаа дахин ачаална уу.
      </DsCard>

      <div v-else-if="!plan" class="gks-plan-page__skeleton" />

      <template v-else>
        <!-- The headline: one date, and the only deadline anybody is shown. -->
        <section class="gks-answer">
          <p class="gks-answer__label">Та Солонгост очих боломжтой</p>
          <strong v-if="departure" class="gks-answer__when">
            {{ formatIntakeMonth(departure.year, departure.month) }}
            <small v-if="intakeSeason(departure.month)">({{ intakeSeason(departure.month) }})</small>
          </strong>
          <strong v-else class="gks-answer__when gks-answer__when--unknown">
            Элсэлтийн мэдээлэл шинэчлэгдэж байна
          </strong>

          <div v-if="departure" class="gks-answer__meta">
            <p v-if="formatPlanDate(departure.registerBy)" class="gks-answer__deadline">
              <DsIcon name="calendar-check" :size="16" />
              Бүртгэлээ <strong>{{ formatPlanDate(departure.registerBy) }}</strong> хүртэл өгнө
              <span v-if="departure.daysToRegister !== null" class="gks-answer__days gks-tnum">
                {{ departure.daysToRegister }} хоног
              </span>
            </p>
            <p v-if="DATE_SOURCE_NOTE[departure.source]" class="gks-answer__note">
              {{ DATE_SOURCE_NOTE[departure.source] }}
            </p>
          </div>

          <DsButton variant="ghost" size="sm" icon-left="rotate-ccw" @click="reopenWizard">
            Хариултаа өөрчлөх
          </DsButton>
        </section>

        <!-- The path. Two cards when Korean has to come first — the single most
             useful thing this page tells anybody. -->
        <ol v-if="plan.stages.length" class="gks-stages">
          <li v-for="(stage, index) in plan.stages" :key="stage.kind + index" class="gks-stage">
            <div class="gks-stage__top">
              <DsIcon :name="stage.kind === 'LANGUAGE_PREP' ? 'languages' : 'graduation-cap'" :size="18" />
              <strong>{{ stage.titleMn }}</strong>
              <span v-if="formatMonths(stage.durationMonths)" class="gks-stage__len">
                {{ formatMonths(stage.durationMonths) }}
              </span>
            </div>
            <p class="gks-stage__when gks-tnum">
              {{ formatIntakeMonth(stage.start.year, stage.start.month) }}-аас
            </p>
            <p class="gks-stage__why">{{ stage.reasonMn }}</p>
          </li>
        </ol>

        <div class="gks-plan-grid">
          <div class="gks-plan-grid__main">
            <!-- Schools, and the controls that change them. This is the
                 interactive half of the answer. -->
            <DsCard>
              <template #action>
                <NuxtLink :to="catalogueLink" class="gks-plan-page__more">
                  Бүгдийг харах <DsIcon name="arrow-right" :size="14" />
                </NuxtLink>
              </template>
              <template #default>
                <div class="gks-schools__head">
                  <h2 class="gks-plan-page__h2">
                    <span class="gks-tnum">{{ plan.schools.total }}</span> анги танд нээлттэй
                  </h2>
                  <p v-if="plan.schools.gate === 'AFTER_PREP'" class="gks-schools__gate">
                    Хэлний бэлтгэлээ дүүргэсний дараа
                  </p>
                </div>

                <div class="gks-schools__filters">
                  <PlanChoiceGrid
                    variant="chip"
                    label="Хот, бүс нутаг"
                    :choices="regionChoices"
                    :counts="regionCounts"
                    :model-value="plan.input.region ?? ''"
                    @update:model-value="apply({ region: $event })"
                  />
                  <PlanChoiceGrid
                    variant="chip"
                    label="Жилийн сургалтын төлбөр"
                    :choices="budgetChoices"
                    :model-value="plan.input.budgetKrw ? String(plan.input.budgetKrw) : ''"
                    @update:model-value="apply({ budget: $event })"
                  />
                </div>

                <p v-if="plan.schools.unlockedByNextTopik" class="gks-schools__unlock">
                  <DsIcon name="lock-open" :size="15" />
                  TOPIK {{ plan.schools.unlockedByNextTopik.topik }} авбал
                  <strong class="gks-tnum">+{{ plan.schools.unlockedByNextTopik.count }}</strong> анги нэмж нээгдэнэ.
                </p>

                <ul v-if="plan.schools.items.length" class="gks-schools__list">
                  <li v-for="program in plan.schools.items" :key="program.id" class="gks-school">
                    <img
                      v-if="program.university.logoPath"
                      :src="program.university.logoPath"
                      :alt="`${program.university.nameEn} лого`"
                      loading="lazy"
                      width="36"
                      height="36"
                    >
                    <span v-else class="gks-school__logo" aria-hidden="true">
                      <DsIcon name="landmark" :size="16" />
                    </span>
                    <div class="gks-school__body">
                      <NuxtLink :to="`/universities/${program.university.slug}`" class="gks-school__name">
                        {{ program.university.nameMn }}
                      </NuxtLink>
                      <small class="gks-school__prog">
                        {{ program.nameMn }} · {{ program.university.cityMn }}
                      </small>
                    </div>
                    <div class="gks-school__price">
                      <strong v-if="annualTuitionKrw(program) !== null" class="gks-tnum">
                        {{ formatKrw(annualTuitionKrw(program)) }}
                      </strong>
                      <strong v-else class="gks-school__unknown">{{ UNKNOWN_LABEL }}</strong>
                      <small>{{ program.topikLevel ? `TOPIK ${program.topikLevel}` : 'TOPIK заагаагүй' }}</small>
                    </div>
                  </li>
                </ul>

                <p v-else class="gks-schools__empty">
                  Энэ нөхцөлд тохирох анги олдсонгүй. Хот, төсвөө өөрчилж үзэх эсвэл
                  <NuxtLink to="/consultation">зөвлөгөө авах хүсэлт</NuxtLink> илгээгээрэй —
                  бид тухайн чиглэлээр аль сургууль байгааг тодруулж өгнө.
                </p>
              </template>
            </DsCard>

            <DsCard>
              <PlanCostCard :cost="plan.cost" :stage-title="firstStage?.titleMn ?? ''" />
            </DsCard>
          </div>

          <aside class="gks-plan-grid__side">
            <DsCard title="Шаардлага">
              <ul class="gks-reqs">
                <li v-for="req in plan.requirements" :key="req.key" class="gks-reqs__row">
                  <DsIcon
                    :name="REQUIREMENT_ICON[String(req.met) as keyof typeof REQUIREMENT_ICON]"
                    :size="17"
                    :class="`gks-reqs__icon gks-reqs__icon--${String(req.met)}`"
                  />
                  <span>
                    <strong>{{ req.labelMn }}</strong>
                    <small>{{ req.valueMn }}</small>
                  </span>
                </li>
              </ul>
            </DsCard>

            <DsCard title="Явцын алхмууд">
              <PlanTimeline :milestones="plan.timeline" />
            </DsCard>
          </aside>
        </div>

        <!-- The one call to action, carrying the plan with it. -->
        <section class="gks-plan-cta">
          <div>
            <h2>Энэ төлөвлөгөөг хамтдаа хэрэгжүүлэх үү?</h2>
            <p>Зөвлөх тань холбогдож, сургууль сонголт, материалын жагсаалтыг тодруулна.</p>
          </div>
          <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo(consultationLink)">
            Зөвлөгөө авах
          </DsButton>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.gks-plan-page {
  max-width: var(--container-page);
  margin: 0 auto;
  padding: var(--sp-8) var(--gutter-mobile) var(--sp-10);
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

@media (min-width: 768px) {
  .gks-plan-page {
    padding-inline: var(--gutter-tablet);
  }
}

/* Refreshing after a chip tap: the old answer stays readable and stops
   accepting clicks, which beats collapsing the page to a skeleton. */
.gks-plan-page--busy {
  opacity: 0.62;
  pointer-events: none;
}

.gks-plan-page__title {
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  letter-spacing: var(--ls-display);
  line-height: var(--lh-tight);
  margin: var(--sp-2) 0 0;
}

.gks-plan-page__lede {
  margin: var(--sp-3) 0 0;
  color: var(--text-muted);
  font-size: var(--fs-body-lg);
}

.gks-plan-page__h2 {
  margin: 0;
  font-size: var(--fs-h4);
  letter-spacing: var(--ls-heading);
}

.gks-plan-page__more {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-accent);
}

.gks-plan-page__state,
.gks-plan-page__skeleton {
  min-height: 200px;
}

.gks-plan-page__skeleton {
  border-radius: var(--radius-3);
  background: linear-gradient(90deg, var(--n-050), var(--n-100), var(--n-050));
  background-size: 200% 100%;
  animation: gks-plan-shimmer 1.4s linear infinite;
}

@keyframes gks-plan-shimmer {
  to { background-position: -200% 0; }
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
  height: 4px;
  flex: 1;
  border-radius: var(--radius-pill);
  background: var(--line-soft);
}

.gks-wizard__dot--on {
  background: var(--line-accent);
}

.gks-wizard__q {
  margin: 0 0 var(--sp-5);
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  letter-spacing: var(--ls-heading);
}

.gks-wizard__field { display: grid; gap: var(--sp-4); }
.gks-wizard__field-actions { display: flex; flex-wrap: wrap; gap: var(--sp-3); }

.gks-wizard__foot {
  margin-top: var(--sp-5);
}

/* ---- The headline ---- */
.gks-answer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-3);
  padding: var(--sp-7) var(--sp-6);
  border-radius: var(--radius-3);
  background: var(--surface-wash);
  border: var(--border-hair) solid var(--line-soft);
}

.gks-answer__label {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}

.gks-answer__when {
  font-family: var(--font-display);
  font-size: var(--fs-display-2);
  line-height: var(--lh-tight);
  letter-spacing: var(--ls-display);
  color: var(--text-strong);
}

.gks-answer__when small {
  font-size: var(--fs-h3);
  color: var(--text-muted);
  font-weight: var(--fw-regular);
}

.gks-answer__when--unknown {
  font-size: var(--fs-h3);
  color: var(--text-muted);
}

.gks-answer__meta {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.gks-answer__deadline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  font-size: var(--fs-body);
}

/* A chip rather than a "· 141 хоног" tail: on a phone the line wraps and a
   leading separator is left stranded at the start of its own line. */
.gks-answer__days {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
}

.gks-answer__note {
  margin: 0;
  color: var(--text-subtle);
  font-size: var(--fs-caption);
}

/* ---- Stages ---- */
.gks-stages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.gks-stage {
  padding: var(--sp-5);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  box-shadow: var(--shadow-raised);
}

.gks-stage__top {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  color: var(--text-accent);
}

.gks-stage__top strong {
  color: var(--text-strong);
  font-size: var(--fs-body-lg);
}

.gks-stage__len {
  margin-left: auto;
  padding: 2px var(--sp-2);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--text-muted);
  font-size: var(--fs-caption);
  font-variant-numeric: var(--num-tabular);
}

.gks-stage__when {
  margin: var(--sp-2) 0 0;
  font-weight: var(--fw-semibold);
  font-variant-numeric: var(--num-tabular);
}

.gks-stage__why {
  margin: var(--sp-1) 0 0;
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
}

/* ---- Layout ---- */
.gks-plan-grid {
  display: grid;
  gap: var(--sp-5);
}

@media (min-width: 1024px) {
  .gks-plan-grid {
    grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
    align-items: start;
  }
}

.gks-plan-grid__main,
.gks-plan-grid__side {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
}

/* ---- Schools ---- */
.gks-schools__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-3);
}

.gks-schools__gate {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-caption);
}

.gks-schools__filters {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin: var(--sp-4) 0;
}

.gks-schools__unlock {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--info-bg);
  border: var(--border-hair) solid var(--info-line);
  color: var(--info-fg);
  font-size: var(--fs-body-sm);
}

.gks-schools__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.gks-school {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-top: var(--border-hair) solid var(--line-soft);
}

.gks-school img,
.gks-school__logo {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-1);
  object-fit: contain;
  flex: none;
}

.gks-school__logo {
  display: grid;
  place-items: center;
  background: var(--surface-sunken);
  color: var(--text-subtle);
}

.gks-school__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
}

.gks-school__name {
  font-weight: var(--fw-semibold);
  color: var(--text-link);
}

.gks-school__prog,
.gks-school__price small {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gks-school__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: var(--num-tabular);
}

.gks-school__unknown {
  color: var(--text-subtle);
  font-size: var(--fs-caption);
  font-weight: var(--fw-regular);
}

.gks-schools__empty {
  margin: 0;
  color: var(--text-muted);
  font-size: var(--fs-body-sm);
}

/* ---- Requirements ---- */
.gks-reqs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.gks-reqs__row {
  display: flex;
  gap: var(--sp-3);
  align-items: flex-start;
}

.gks-reqs__row span {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.gks-reqs__row strong {
  font-size: var(--fs-body-sm);
}

.gks-reqs__row small {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-body);
}

.gks-reqs__icon--true { color: var(--success-fg); }
.gks-reqs__icon--false { color: var(--warning-fg); }
.gks-reqs__icon--null { color: var(--text-subtle); }

/* ---- CTA ---- */
.gks-plan-cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-5);
  padding: var(--sp-7) var(--sp-6);
  border-radius: var(--radius-3);
  background: var(--surface-inverse);
  color: var(--text-inverse);
}

.gks-plan-cta h2 {
  margin: 0;
  /* The global heading rule sets a dark ink colour; on the inverse panel it has
     to be said again, or the heading disappears into the background. */
  color: var(--text-inverse);
  font-family: var(--font-display);
  font-size: var(--fs-h3);
  letter-spacing: var(--ls-heading);
}

.gks-plan-cta p {
  margin: var(--sp-2) 0 0;
  color: var(--n-300);
  font-size: var(--fs-body-sm);
}
</style>
