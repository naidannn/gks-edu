<script setup lang="ts">
import type { QuestionnaireAnswers, QuestionnaireDefinition, RecommenderField } from '@gks/shared';
import type { AutosaveState } from '~/composables/useQuestionnaireAutosave';

/**
 * A questionnaire as a walk, one section per screen (1D-27).
 *
 * The office's essay list is ~80 questions. On one page that is a wall people
 * close; as thirteen short screens it is something you finish over two
 * evenings. So: one section at a time, the whole map always one glance away
 * (a rail on desktop, a sheet on a phone), a count of what is left in minutes
 * rather than questions, and a last screen that shows everything before it is
 * sent. Only the few questions marked required stop the submission — the rest
 * are asked, never demanded.
 *
 * The form owns navigation only. Saving belongs to the page (`useQuestionnaireAutosave`),
 * which hears every edit through `change` and every screen change through `step`.
 */
const props = withDefaults(
  defineProps<{
    definition: QuestionnaireDefinition;
    answers: QuestionnaireAnswers;
    /** Section V of a recommendation — the teacher's own details, as a last screen. */
    recommenderFields?: RecommenderField[];
    recommender?: QuestionnaireAnswers;
    saveState?: AutosaveState;
    savedAt?: Date | null;
    saveError?: string | null;
    submitting?: boolean;
    submitLabel?: string;
    /** What the confirmation checkbox on the last screen says. */
    confirmLabel?: string;
    /** Remembers the screen the person left on, per questionnaire. */
    stepKey?: string;
  }>(),
  {
    recommenderFields: undefined,
    recommender: undefined,
    saveState: 'idle',
    savedAt: null,
    saveError: null,
    submitting: false,
    submitLabel: 'Илгээх',
    confirmLabel: 'Миний бичсэн мэдээлэл үнэн зөв болохыг баталж байна.',
    stepKey: undefined,
  },
);

const emit = defineEmits<{
  'update:answers': [value: QuestionnaireAnswers];
  'update:recommender': [value: QuestionnaireAnswers];
  change: [];
  step: [];
  submit: [];
}>();

const steps = computed(() => questionnaireSteps(props.definition));
const hasDetails = computed(() => Boolean(props.recommenderFields?.length));
/** Sections, then the teacher's details if any, then the review. */
const lastIndex = computed(() => steps.value.length + (hasDetails.value ? 1 : 0));
const detailsIndex = computed(() => (hasDetails.value ? steps.value.length : -1));

const current = ref(restoreStep());
const mapOpen = ref(false);
const confirmed = ref(false);
const tried = ref(false);
const root = ref<HTMLElement | null>(null);

const onReview = computed(() => current.value === lastIndex.value);
const onDetails = computed(() => current.value === detailsIndex.value);
const step = computed(() => steps.value[current.value] ?? null);

const progress = computed(() => questionnaireProgress(props.definition, props.answers));
const missingDetails = computed(() =>
  (props.recommenderFields ?? []).filter((field) => field.required && !isAnswered(props.recommender?.[field.id])),
);
const canSubmit = computed(() => !progress.value.missingRequired.length && !missingDetails.value.length && confirmed.value);
const percent = computed(() => (progress.value.total ? Math.round((progress.value.answered / progress.value.total) * 100) : 0));
const minutes = computed(() => minutesLeft(props.definition, props.answers));

function setAnswer(id: string, value: string) {
  emit('update:answers', { ...props.answers, [id]: value });
  emit('change');
}

function setDetail(id: string, value: string) {
  emit('update:recommender', { ...(props.recommender ?? {}), [id]: value });
  emit('change');
}

function go(index: number) {
  current.value = Math.max(0, Math.min(index, lastIndex.value));
  mapOpen.value = false;
  emit('step');
  rememberStep();
  nextTick(() => root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

/** Where a required, unanswered question lives — the review's "fix this" links. */
function stepOf(questionId: string): number {
  return steps.value.findIndex((entry) => entry.section.questions.some((question) => question.id === questionId));
}

function trySubmit() {
  tried.value = true;
  const firstMissing = progress.value.missingRequired[0];
  if (firstMissing) {
    go(stepOf(firstMissing));
    return;
  }
  if (missingDetails.value.length) {
    go(detailsIndex.value);
    return;
  }
  if (canSubmit.value) emit('submit');
}

type SectionState = 'done' | 'started' | 'empty';
function sectionState(index: number): SectionState {
  const entry = steps.value[index];
  if (!entry) return 'empty';
  const { answered, total } = sectionProgress(entry.section, props.answers);
  if (total && answered >= total) return 'done';
  return answered ? 'started' : 'empty';
}
const STATE_ICON: Record<SectionState, string> = { done: 'circle-check', started: 'circle-dot', empty: 'circle' };

function isFlagged(questionId: string, required?: boolean) {
  return Boolean(tried.value && required && !isAnswered(props.answers[questionId]));
}

// ── Remembering the screen — a per-viewer convenience, never relied on. ─────
function restoreStep(): number {
  if (!props.stepKey || typeof window === 'undefined') return 0;
  try {
    const saved = Number(window.localStorage.getItem(`gks-q-step:${props.stepKey}`));
    return Number.isInteger(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}
function rememberStep() {
  if (!props.stepKey) return;
  try {
    window.localStorage.setItem(`gks-q-step:${props.stepKey}`, String(current.value));
  } catch {
    // Private mode or blocked storage: the form simply opens at the start.
  }
}
onMounted(() => {
  if (current.value > lastIndex.value) current.value = 0;
});
// On a phone the map opens above the card — bring it into view.
watch(mapOpen, (open) => {
  if (open) nextTick(() => root.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
});

const saveLabel = computed(() => {
  switch (props.saveState) {
    case 'saving':
      return 'Хадгалж байна…';
    case 'dirty':
      return 'Хадгалагдаагүй өөрчлөлт';
    case 'error':
      return 'Хадгалж чадсангүй';
    case 'saved':
      return props.savedAt ? `Хадгалсан · ${formatTime(props.savedAt)}` : 'Хадгалсан';
    default:
      return 'Автоматаар хадгалагдана';
  }
});

/** A subheading goes above the first question of each group. */
function opensGroup(index: number): string | null {
  const questions = step.value ? visibleQuestions(step.value.section, props.answers) : [];
  const group = questions[index]?.group;
  return group && group !== questions[index - 1]?.group ? group : null;
}

defineExpose({ go });
</script>

<template>
  <div ref="root" class="gks-qf">
    <!-- The map: a rail on desktop, a sheet under the sticky bar on a phone. -->
    <aside class="gks-qf__rail" :class="{ 'gks-qf__rail--open': mapOpen }" aria-label="Асуулгын хэсгүүд">
      <div class="gks-qf__overall">
        <div class="gks-qf__overall-top">
          <span class="gks-qf__overall-num gks-tnum">{{ percent }}%</span>
          <span class="gks-qf__overall-meta">
            {{ progress.answered }}/{{ progress.total }} асуулт<template v-if="minutes"> · ~{{ minutes }} мин үлдсэн</template>
          </span>
        </div>
        <div class="gks-qf__bar"><span :style="{ width: `${percent}%` }" /></div>
      </div>

      <template v-for="(entry, index) in steps" :key="entry.key">
        <p v-if="entry.opensPart" class="gks-qf__rail-part">
          {{ entry.partTitle }}<span v-if="entry.partTitleEn"> · {{ entry.partTitleEn }}</span>
        </p>
        <button
          type="button"
          class="gks-qf__rail-item"
          :class="[`gks-qf__rail-item--${sectionState(index)}`, { 'gks-qf__rail-item--current': index === current }]"
          @click="go(index)"
        >
          <DsIcon :name="STATE_ICON[sectionState(index)]" :size="16" />
          <span>{{ entry.section.title }}</span>
        </button>
      </template>
      <button
        v-if="hasDetails"
        type="button"
        class="gks-qf__rail-item"
        :class="{ 'gks-qf__rail-item--current': onDetails, 'gks-qf__rail-item--done': !missingDetails.length }"
        @click="go(detailsIndex)"
      >
        <DsIcon :name="missingDetails.length ? 'circle' : 'circle-check'" :size="16" />
        <span>Таны мэдээлэл</span>
      </button>
      <button
        type="button"
        class="gks-qf__rail-item gks-qf__rail-item--review"
        :class="{ 'gks-qf__rail-item--current': onReview }"
        @click="go(lastIndex)"
      >
        <DsIcon name="send" :size="16" />
        <span>Хянаж, илгээх</span>
      </button>
    </aside>

    <div class="gks-qf__main">
      <!-- Phone: where am I, and the map one tap away. -->
      <div class="gks-qf__mobilebar">
        <button type="button" class="gks-qf__mobilebar-btn" :aria-expanded="mapOpen" @click="mapOpen = !mapOpen">
          <span class="gks-qf__mobilebar-count gks-tnum">{{ Math.min(current + 1, lastIndex + 1) }}/{{ lastIndex + 1 }}</span>
          <span class="gks-qf__mobilebar-title">
            {{ onReview ? 'Хянаж, илгээх' : onDetails ? 'Таны мэдээлэл' : step?.section.title }}
          </span>
          <DsIcon :name="mapOpen ? 'chevron-up' : 'list'" :size="18" />
        </button>
        <div class="gks-qf__bar"><span :style="{ width: `${percent}%` }" /></div>
      </div>

      <!-- ── A section ─────────────────────────────────────────────── -->
      <section v-if="step && !onReview && !onDetails" class="gks-qf__section">
        <header class="gks-qf__head">
          <p class="gks-eyebrow">
            {{ step.partTitle }}<template v-if="step.partTitleEn"> · {{ step.partTitleEn }}</template>
          </p>
          <h2 class="gks-qf__title">{{ step.section.title }}</h2>
          <p v-if="step.section.titleEn && step.section.titleEn !== step.partTitleEn" class="gks-qf__title-en">
            {{ step.section.titleEn }}
          </p>
          <p v-if="step.section.purpose" class="gks-qf__purpose">
            <DsIcon name="lightbulb" :size="16" /> {{ step.section.purpose }}
          </p>
          <p v-if="step.section.minutes" class="gks-qf__minutes">
            <DsIcon name="clock" :size="14" /> ~{{ step.section.minutes }} минут
          </p>
        </header>

        <div v-if="step.opensPart && step.partRequirement" class="gks-qf__callout gks-qf__callout--info">
          <DsIcon name="file-text" :size="16" />
          <span><strong>{{ step.partTitleEn ?? step.partTitle }}:</strong> {{ step.partRequirement }}</span>
        </div>
        <div v-if="step.section.note" class="gks-qf__callout gks-qf__callout--warn">
          <DsIcon name="shield-alert" :size="16" />
          <span>{{ step.section.note }}</span>
        </div>

        <div class="gks-qf__questions">
          <template v-for="(question, index) in visibleQuestions(step.section, answers)" :key="question.id">
            <h3 v-if="opensGroup(index)" class="gks-qf__group">{{ opensGroup(index) }}</h3>
            <QuestionnaireQuestion
              :question="question"
              :model-value="answers[question.id]"
              :flagged="isFlagged(question.id, question.required)"
              @update:model-value="setAnswer(question.id, $event)"
            />
          </template>
        </div>
      </section>

      <!-- ── The teacher's own details ─────────────────────────────── -->
      <section v-else-if="onDetails" class="gks-qf__section">
        <header class="gks-qf__head">
          <p class="gks-eyebrow">Тодорхойлолт өгөгч</p>
          <h2 class="gks-qf__title">Таны мэдээлэл</h2>
          <p class="gks-qf__purpose">
            <DsIcon name="lightbulb" :size="16" /> Англи хувилбарын доод хэсэгт таны нэр, албан тушаал, холбоо барих мэдээлэл орно.
          </p>
        </header>
        <div class="gks-qf__details">
          <DsInput
            v-for="field in recommenderFields"
            :key="field.id"
            :model-value="recommender?.[field.id] ?? ''"
            :label="field.label"
            :required="field.required"
            :type="field.type ?? 'text'"
            :placeholder="field.placeholder"
            :error="tried && field.required && !isAnswered(recommender?.[field.id]) ? 'Заавал бөглөнө' : undefined"
            @update:model-value="setDetail(field.id, String($event))"
          />
        </div>
      </section>

      <!-- ── Review ────────────────────────────────────────────────── -->
      <section v-else class="gks-qf__section">
        <header class="gks-qf__head">
          <p class="gks-eyebrow">Сүүлийн алхам</p>
          <h2 class="gks-qf__title">Хянаж, илгээх</h2>
          <p class="gks-qf__purpose">
            <DsIcon name="lightbulb" :size="16" />
            <span>
              Илгээсний дараа засах бол зөвлөхдөө хэлэхэд л болно. Хариулаагүй асуултууд байвал ч илгээж болно —
              зөвхөн <span class="gks-q-star">*</span> тэмдэгтэйг заавал бөглөнө.
            </span>
          </p>
        </header>

        <div v-if="progress.missingRequired.length || missingDetails.length" class="gks-qf__callout gks-qf__callout--warn">
          <DsIcon name="circle-alert" :size="16" />
          <div>
            <strong>Заавал хариулах {{ progress.missingRequired.length + missingDetails.length }} зүйл үлдлээ:</strong>
            <ul class="gks-qf__missing">
              <li v-for="id in progress.missingRequired" :key="id">
                <button type="button" class="gks-qf__link" @click="go(stepOf(id))">
                  {{ steps[stepOf(id)]?.section.questions.find((q) => q.id === id)?.label }}
                </button>
              </li>
              <li v-for="field in missingDetails" :key="field.id">
                <button type="button" class="gks-qf__link" @click="go(detailsIndex)">{{ field.label }}</button>
              </li>
            </ul>
          </div>
        </div>

        <ul class="gks-qf__summary">
          <li v-for="(entry, index) in steps" :key="entry.key" class="gks-qf__summary-row">
            <DsIcon :name="STATE_ICON[sectionState(index)]" :size="16" :class="`gks-qf__state--${sectionState(index)}`" />
            <span class="gks-qf__summary-title">{{ entry.section.title }}</span>
            <span class="gks-qf__summary-count gks-tnum">
              {{ sectionProgress(entry.section, answers).answered }}/{{ sectionProgress(entry.section, answers).total }}
            </span>
            <button type="button" class="gks-qf__link" @click="go(index)">Засах</button>
          </li>
        </ul>

        <label class="gks-qf__confirm">
          <input v-model="confirmed" type="checkbox">
          <span>{{ confirmLabel }}</span>
        </label>

        <DsButton variant="accent" size="lg" icon-left="send" :loading="submitting" :disabled="!confirmed" @click="trySubmit">
          {{ submitLabel }}
        </DsButton>
      </section>

      <!-- ── Footer: back / next, and whether it is saved. ──────────── -->
      <footer class="gks-qf__foot">
        <DsButton v-if="current > 0" variant="secondary" icon-left="arrow-left" @click="go(current - 1)">Буцах</DsButton>
        <span v-else />
        <span class="gks-qf__save" :class="`gks-qf__save--${saveState}`" role="status">
          <DsIcon
            :name="saveState === 'error' ? 'cloud-off' : saveState === 'saving' ? 'loader-circle' : 'save'"
            :size="14"
          />
          {{ saveLabel }}
        </span>
        <DsButton v-if="!onReview" variant="primary" icon-right="arrow-right" @click="go(current + 1)">
          {{ current + 1 === lastIndex ? 'Хянах' : 'Дараах' }}
        </DsButton>
        <span v-else />
      </footer>
      <p v-if="saveState === 'error' && saveError" class="gks-qf__save-error">{{ saveError }}</p>
    </div>
  </div>
</template>

<style scoped>
.gks-qf { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--sp-6); align-items: start; scroll-margin-top: var(--sp-6); }

/* ── Rail ─────────────────────────────────────────────── */
.gks-qf__rail {
  position: sticky;
  top: var(--sp-6);
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: calc(100vh - var(--sp-10));
  overflow-y: auto;
  padding: var(--sp-4);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.gks-qf__overall { padding-bottom: var(--sp-3); margin-bottom: var(--sp-2); border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-qf__overall-top { display: flex; align-items: baseline; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.gks-qf__overall-num { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--brand-700); }
.gks-qf__overall-meta { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-qf__bar { height: 4px; border-radius: var(--radius-pill); background: var(--n-100); overflow: hidden; }
.gks-qf__bar span { display: block; height: 100%; background: var(--brand-600); transition: width var(--dur-base) var(--ease-standard); }
.gks-qf__rail-part {
  margin-top: var(--sp-3);
  padding: 0 var(--sp-2) var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--text-subtle);
}
.gks-qf__rail-item {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  width: 100%;
  padding: var(--sp-2);
  border: 0;
  border-radius: var(--radius-2);
  background: none;
  font: inherit;
  font-size: var(--fs-body-sm);
  line-height: var(--lh-snug);
  text-align: left;
  color: var(--text-body);
  cursor: pointer;
}
.gks-qf__rail-item > :first-child { flex-shrink: 0; margin-top: 1px; color: var(--n-400); }
.gks-qf__rail-item:hover { background: var(--surface-hover); }
.gks-qf__rail-item--done > :first-child { color: var(--success-fg); }
.gks-qf__rail-item--started > :first-child { color: var(--brand-600); }
.gks-qf__rail-item--current { background: var(--brand-050); color: var(--brand-800); font-weight: var(--fw-semibold); }
.gks-qf__rail-item--review { margin-top: var(--sp-3); border-top: var(--border-hair) solid var(--line-hairline); border-radius: 0; padding-top: var(--sp-3); }

/* ── Main ─────────────────────────────────────────────── */
.gks-qf__main {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  min-width: 0;
  padding: var(--sp-6);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-3);
  background: var(--surface-card);
}
.gks-qf__mobilebar { display: none; }
.gks-qf__section { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-qf__head { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-qf__title { font-family: var(--font-display); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); line-height: var(--lh-heading); }
.gks-qf__title-en { font-size: var(--fs-body-sm); color: var(--text-muted); margin-top: calc(var(--sp-1) * -1); }
.gks-qf__purpose { display: flex; gap: var(--sp-2); align-items: flex-start; font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-qf__purpose > :first-child { flex-shrink: 0; margin-top: 2px; color: var(--amber-600); }
.gks-qf__minutes { display: inline-flex; align-items: center; gap: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-qf__callout { display: flex; gap: var(--sp-3); align-items: flex-start; padding: var(--sp-3) var(--sp-4); border-radius: var(--radius-2); font-size: var(--fs-body-sm); line-height: var(--lh-snug); }
.gks-qf__callout > :first-child { flex-shrink: 0; margin-top: 2px; }
.gks-qf__callout--info { background: var(--info-bg); border: var(--border-hair) solid var(--info-line); color: var(--info-fg); }
.gks-qf__callout--warn { background: var(--warning-bg); border: var(--border-hair) solid var(--warning-line); color: var(--warning-fg); }

.gks-qf__questions { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-qf__group {
  margin-top: var(--sp-2);
  padding-top: var(--sp-4);
  border-top: var(--border-hair) solid var(--line-hairline);
  font-size: var(--fs-label);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--brand-700);
}
.gks-qf__group:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
.gks-qf__details { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }

.gks-qf__missing { margin-top: var(--sp-2); display: flex; flex-direction: column; gap: var(--sp-1); padding-left: var(--sp-4); list-style: disc; }
.gks-qf__link { border: 0; background: none; padding: 0; font: inherit; color: var(--text-link); text-align: left; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }
.gks-qf__summary { display: flex; flex-direction: column; border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-2); }
.gks-qf__summary-row { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); font-size: var(--fs-body-sm); }
.gks-qf__summary-row + .gks-qf__summary-row { border-top: var(--border-hair) solid var(--line-hairline); }
.gks-qf__summary-title { flex: 1; min-width: 0; }
.gks-qf__summary-count { color: var(--text-muted); }
.gks-qf__state--done { color: var(--success-fg); }
.gks-qf__state--started { color: var(--brand-600); }
.gks-qf__state--empty { color: var(--n-400); }
.gks-q-star { color: var(--red-700); }
.gks-qf__confirm { display: flex; gap: var(--sp-3); align-items: flex-start; font-size: var(--fs-body-sm); color: var(--text-body); cursor: pointer; }
.gks-qf__confirm input { margin-top: 3px; width: 18px; height: 18px; accent-color: var(--brand-600); flex-shrink: 0; }

/* ── Footer ───────────────────────────────────────────── */
.gks-qf__foot {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--sp-3);
  padding-top: var(--sp-5);
  border-top: var(--border-hair) solid var(--line-hairline);
}
.gks-qf__save { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-1); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-qf__save--saved { color: var(--success-fg); }
.gks-qf__save--error { color: var(--danger-fg); }
.gks-qf__save--saving :deep(.gks-icon) { animation: gks-qf-spin 1s linear infinite; }
.gks-qf__save-error { font-size: var(--fs-caption); color: var(--danger-fg); text-align: center; }
@keyframes gks-qf-spin { to { transform: rotate(360deg); } }

/* ── Phone ────────────────────────────────────────────── */
@media (max-width: 960px) {
  .gks-qf { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .gks-qf__rail {
    display: none;
    position: static;
    max-height: none;
    margin-bottom: var(--sp-3);
    order: 0;
  }
  .gks-qf__rail--open { display: flex; }
  .gks-qf__main { padding: var(--sp-4); border-radius: var(--radius-3); }
  .gks-qf__mobilebar {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    position: sticky;
    top: 0;
    z-index: 5;
    margin: calc(var(--sp-4) * -1) calc(var(--sp-4) * -1) 0;
    padding: var(--sp-3) var(--sp-4);
    background: var(--surface-card);
    border-bottom: var(--border-hair) solid var(--line-hairline);
    border-radius: var(--radius-3) var(--radius-3) 0 0;
  }
  .gks-qf__mobilebar-btn { display: flex; align-items: center; gap: var(--sp-3); border: 0; background: none; padding: 0; font: inherit; color: var(--text-strong); cursor: pointer; text-align: left; }
  .gks-qf__mobilebar-count { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--brand-700); background: var(--brand-050); padding: 2px var(--sp-2); border-radius: var(--radius-pill); }
  .gks-qf__mobilebar-title { flex: 1; min-width: 0; font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gks-qf__details { grid-template-columns: minmax(0, 1fr); }
  .gks-qf__foot { grid-template-columns: 1fr 1fr; }
  .gks-qf__save { grid-column: 1 / -1; grid-row: 2; }
}
</style>
