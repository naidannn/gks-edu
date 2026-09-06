<script setup lang="ts">
import type {
  AdminIntakeTerm,
  AdminIntakeTermWithUniversity,
  IntakeCandidate,
  IntakeResearchRun,
  ProgramLevel,
} from '@gks/shared';

/**
 * Add or edit one intake round (1H-05), by hand or with Gemini's help (1H-10).
 *
 * The rule the LLM mode is built around: **research fills the form, a human
 * saves it.** A candidate is dropped into the boxes next to the page it was
 * read off; nothing is written until somebody presses save. Filling the
 * office's deadline calendar unattended is the failure this feature prevents,
 * not the feature itself.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const api = useApi();
const route = useRoute();
const catalogue = useUniversityCatalogue();

const editingId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));
useHead({ title: () => (editingId.value ? 'Элсэлт засах · Админ' : 'Шинэ элсэлт · Админ') });

const mode = ref<'manual' | 'research'>('manual');
const form = reactive(emptyIntakeForm());
const errors = ref<IntakeFormErrors>({});
const saving = ref(false);
const saveError = ref<string | null>(null);
const loading = ref(false);
const existing = ref<AdminIntakeTermWithUniversity | null>(null);

const LEVEL_OPTIONS = [
  { value: '', label: 'Сонгоно уу' },
  ...Object.entries(PROGRAM_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];
const MONTH_OPTIONS = [3, 6, 9, 12].map((m) => ({
  value: String(m),
  label: INTAKE_MONTH_LABELS[m] ?? `${m}-р сар`,
}));
const STATUS_OPTIONS = Object.entries(INTAKE_STATUS_LABELS).map(([value, label]) => ({ value, label }));

const universityOptions = computed(() =>
  toUniversityOptions(catalogue.universities.value, 'Сургууль сонгоно уу'));

onMounted(async () => {
  catalogue.load();
  if (typeof route.query.universityId === 'string') form.universityId = route.query.universityId;
  if (editingId.value) await loadExisting(editingId.value);
});

async function loadExisting(id: string) {
  loading.value = true;
  try {
    const intake = await api.get<AdminIntakeTermWithUniversity>(`/admin/admissions/${id}`);
    existing.value = intake;
    fillIntakeForm(form, intake);
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Элсэлтийн мэдээллийг ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
}

/**
 * What the internal deadline will become once saved, shown live so the rule is
 * visible before anyone commits to it.
 */
const config = ref<{ internalLeadDays: number } | null>(null);
onMounted(async () => {
  try {
    config.value = await api.get<{ internalLeadDays: number }>('/admin/admissions/config');
  } catch {
    config.value = null;
  }
});

const derivedInternalDeadline = computed(() => {
  if (form.internalDeadline) return null;
  if (!form.applicationDeadline || !config.value) return null;
  const days = config.value.internalLeadDays;
  const date = new Date(`${form.applicationDeadline}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return { date: date.toISOString().slice(0, 10), days };
});

async function save() {
  errors.value = validateIntakeForm(form);
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  saveError.value = null;
  try {
    const payload = intakePayload(form, { includeUniversity: !editingId.value });
    if (editingId.value) {
      await api.patch<AdminIntakeTerm>(`/admin/admissions/${editingId.value}`, payload);
    } else {
      await api.post<AdminIntakeTerm>('/admin/admissions', payload);
    }
    await navigateTo('/admin/admissions');
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!editingId.value) return;
  saving.value = true;
  saveError.value = null;
  try {
    await api.delete(`/admin/admissions/${editingId.value}`);
    await navigateTo('/admin/admissions');
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Устгаж чадсангүй');
  } finally {
    saving.value = false;
  }
}

/* ----------------------------------------------------------------------- *
 * Gemini research (1H-10)
 * ----------------------------------------------------------------------- */

const researchYear = ref(String(new Date().getFullYear() + 1));
const researchLevels = ref<ProgramLevel[]>([]);
const run = ref<IntakeResearchRun | null>(null);
const researching = ref(false);
const researchError = ref<string | null>(null);
/** Candidates already dropped into the form, so the button reads "нэмсэн". */
const usedCandidates = ref<Set<string>>(new Set());
let poll: ReturnType<typeof setInterval> | undefined;

const RESEARCH_YEARS = [0, 1, 2].map((offset) => {
  const year = new Date().getFullYear() + offset;
  return { value: String(year), label: `${year} он` };
});

function candidateKey(candidate: IntakeCandidate): string {
  return `${candidate.level}:${candidate.year}:${candidate.month}`;
}

function toggleLevel(level: ProgramLevel) {
  researchLevels.value = researchLevels.value.includes(level)
    ? researchLevels.value.filter((entry) => entry !== level)
    : [...researchLevels.value, level];
}

async function startResearch() {
  if (!form.universityId) {
    researchError.value = 'Эхлээд сургуулиа сонгоно уу.';
    return;
  }
  researching.value = true;
  researchError.value = null;
  usedCandidates.value = new Set();
  try {
    run.value = await api.post<IntakeResearchRun>('/admin/admissions/research', {
      universityId: form.universityId,
      year: Number.parseInt(researchYear.value, 10),
      ...(researchLevels.value.length ? { levels: researchLevels.value } : {}),
    });
    startPolling();
  } catch (err) {
    researching.value = false;
    researchError.value = apiErrorMessage(err, 'Судалгааг эхлүүлж чадсангүй');
  }
}

/**
 * A grounded search runs 30-90s, so the run is a queued job and this polls it.
 * Three seconds is a compromise: fast enough that the screen feels live,
 * slow enough not to hammer the API for a minute and a half.
 */
function startPolling() {
  clearInterval(poll);
  poll = setInterval(async () => {
    const id = run.value?.id;
    if (!id) return;
    try {
      const updated = await api.get<IntakeResearchRun>(`/admin/admissions/research/${id}`);
      run.value = updated;
      if (updated.status === 'SUCCEEDED' || updated.status === 'FAILED') {
        clearInterval(poll);
        researching.value = false;
        if (updated.status === 'FAILED') researchError.value = updated.error ?? 'Судалгаа амжилтгүй боллоо';
      }
    } catch {
      clearInterval(poll);
      researching.value = false;
      researchError.value = 'Судалгааны төлвийг шалгаж чадсангүй';
    }
  }, 3000);
}

onBeforeUnmount(() => clearInterval(poll));

/** Fills the form from a candidate — and only the form. Nothing is saved. */
function applyCandidate(candidate: IntakeCandidate) {
  fillIntakeFormFromCandidate(form, candidate);
  usedCandidates.value = new Set([...usedCandidates.value, candidateKey(candidate)]);
  mode.value = 'manual';
  errors.value = {};
}

const candidates = computed(() => run.value?.candidates ?? []);

function formatDate(value: string | null): string {
  return value ?? '—';
}
</script>

<template>
  <div class="gks-page gks-page--form gks-intake-form">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Элсэлт</span>
        <h1 class="gks-page__title">{{ editingId ? 'Элсэлт засах' : 'Шинэ элсэлт нэмэх' }}</h1>
        <p v-if="existing" class="gks-page__hint">
          {{ universityName(existing.university) }} — {{ existing.year }} ·
          {{ INTAKE_MONTH_LABELS[existing.month] ?? `${existing.month}-р сар` }}
        </p>
      </div>
      <DsButton variant="ghost" icon-left="arrow-left" @click="navigateTo('/admin/admissions')">Буцах</DsButton>
    </header>

    <!-- Mode switch: only meaningful when creating; editing is always by hand. -->
    <div v-if="!editingId" class="gks-intake-form__modes" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'manual'"
        :class="{ 'is-active': mode === 'manual' }"
        @click="mode = 'manual'"
      >
        <DsIcon name="pencil" :size="16" /> Гараар оруулах
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="mode === 'research'"
        :class="{ 'is-active': mode === 'research' }"
        @click="mode = 'research'"
      >
        <DsIcon name="sparkles" :size="16" /> Интернэтээс судлуулах
      </button>
    </div>

    <!-- ─── LLM research ────────────────────────────────────────────────── -->
    <DsCard v-if="mode === 'research' && !editingId" title="Gemini-гээр судлуулах">
      <p class="gks-intake-form__note">
        Gemini сургуулийн албан ёсны хуудсуудаас (солонгос хэл дээрх 모집요강 зэрэг) тухайн жилийн
        элсэлтийн хугацааг хайж олно. Үр дүн нь <strong>зөвхөн санал</strong> — та эх сурвалжийг нь
        хараад, итгэсэн мөрөө формд буулгаж, өөрөө хадгална. Систем автоматаар юу ч нэмэхгүй.
      </p>

      <div class="gks-intake-form__research-controls">
        <DsCombobox
          v-model="form.universityId"
          label="Сургууль"
          :options="universityOptions"
          :loading="catalogue.loading.value"
        />
        <DsSelect v-model="researchYear" label="Жил" :options="RESEARCH_YEARS" />
      </div>

      <fieldset class="gks-intake-form__levels">
        <legend>Түвшин <span>(сонгохгүй бол бүгдийг)</span></legend>
        <DsTag
          v-for="(label, level) in PROGRAM_LEVEL_LABELS"
          :key="level"
          clickable
          :selected="researchLevels.includes(level as ProgramLevel)"
          @click="toggleLevel(level as ProgramLevel)"
        >
          {{ label }}
        </DsTag>
      </fieldset>

      <DsButton
        variant="accent"
        icon-left="search"
        :loading="researching"
        :disabled="!form.universityId"
        @click="startResearch"
      >
        {{ researching ? 'Судалж байна…' : 'Интернэтээс судлах' }}
      </DsButton>

      <p v-if="researching" class="gks-intake-form__note">
        Вэб хайлт 30–90 секунд үргэлжилж болно. Хуудсаа хаахгүй байна уу.
      </p>
      <p v-if="researchError" class="gks-intake-form__error">{{ researchError }}</p>

      <template v-if="run && run.status === 'SUCCEEDED'">
        <div v-if="!candidates.length" class="gks-intake-form__note">
          Энэ жилийн элсэлтийн хугацааг олсонгүй. Сургуулийн сайтаас гараар шалгаж оруулна уу.
        </div>

        <ul v-else class="gks-intake-form__candidates">
          <li v-for="candidate in candidates" :key="candidateKey(candidate)">
            <div class="gks-intake-form__candidate-head">
              <strong>
                {{ candidate.year }} · {{ INTAKE_MONTH_LABELS[candidate.month] ?? `${candidate.month}-р сар` }}
                — {{ PROGRAM_LEVEL_LABELS[candidate.level] }}
              </strong>
              <DsBadge :tone="RESEARCH_CONFIDENCE_TONE[candidate.confidence]">
                Итгэл: {{ RESEARCH_CONFIDENCE_LABELS[candidate.confidence] }}
              </DsBadge>
            </div>
            <dl class="gks-intake-form__candidate-dates">
              <div><dt>Бүртгэл эхлэх</dt><dd class="gks-tnum">{{ formatDate(candidate.openAt) }}</dd></div>
              <div>
                <dt>Сургуулийн эцсийн хугацаа</dt>
                <dd class="gks-tnum">{{ formatDate(candidate.applicationDeadline) }}</dd>
              </div>
              <div><dt>Хичээл эхлэх</dt><dd class="gks-tnum">{{ formatDate(candidate.classStartDate) }}</dd></div>
              <div v-if="candidate.quota !== null"><dt>Авах хүн</dt><dd class="gks-tnum">{{ candidate.quota }}</dd></div>
            </dl>
            <p v-if="candidate.requirementNote" class="gks-intake-form__candidate-note">
              {{ candidate.requirementNote }}
            </p>
            <p v-if="candidate.note" class="gks-intake-form__candidate-note gks-intake-form__candidate-warn">
              {{ candidate.note }}
            </p>
            <footer class="gks-intake-form__candidate-foot">
              <a v-if="candidate.sourceUrl" :href="candidate.sourceUrl" target="_blank" rel="noopener noreferrer">
                <DsIcon name="external-link" :size="14" /> Эх сурвалж
              </a>
              <span v-else class="gks-intake-form__candidate-warn">Эх сурвалж заагаагүй</span>
              <DsButton
                size="sm"
                :variant="usedCandidates.has(candidateKey(candidate)) ? 'ghost' : 'secondary'"
                icon-left="arrow-down-to-line"
                @click="applyCandidate(candidate)"
              >
                {{ usedCandidates.has(candidateKey(candidate)) ? 'Дахин буулгах' : 'Формд буулгах' }}
              </DsButton>
            </footer>
          </li>
        </ul>

        <details v-if="run.sources.length" class="gks-intake-form__sources">
          <summary>Уншсан хуудсууд ({{ run.sources.length }})</summary>
          <ul>
            <li v-for="source in run.sources" :key="source">
              <a :href="source" target="_blank" rel="noopener noreferrer">{{ source }}</a>
            </li>
          </ul>
        </details>
      </template>
    </DsCard>

    <!-- ─── The form ─────────────────────────────────────────────────────── -->
    <DsCard :title="editingId ? 'Элсэлтийн мэдээлэл' : 'Элсэлтийн мэдээлэл (хянаад хадгална уу)'">
      <div v-if="loading" class="gks-intake-form__note">Ачаалж байна…</div>

      <template v-else>
        <div class="gks-form-grid">
          <DsCombobox
            v-model="form.universityId"
            label="Сургууль"
            :options="universityOptions"
            :disabled="Boolean(editingId)"
            :loading="catalogue.loading.value"
            :error="errors.universityId"
          />
          <DsSelect v-model="form.level" label="Түвшин" :options="LEVEL_OPTIONS" :error="errors.level" />
          <DsInput v-model="form.year" label="Жил" type="number" :error="errors.year" />
          <DsSelect v-model="form.month" label="Элсэлтийн сар" :options="MONTH_OPTIONS" :error="errors.month" />
        </div>

        <h3 class="gks-intake-form__section">Хугацаа</h3>
        <div class="gks-form-grid">
          <DsInput v-model="form.openAt" label="Бүртгэл эхлэх" type="date" :error="errors.openAt" />
          <DsInput
            v-model="form.applicationDeadline"
            label="Сургуулийн эцсийн хугацаа"
            type="date"
          />
          <DsInput
            v-model="form.internalDeadline"
            label="Манай эцсийн хугацаа"
            type="date"
            :error="errors.internalDeadline"
          />
          <DsInput v-model="form.classStartDate" label="Хичээл эхлэх" type="date" :error="errors.classStartDate" />
          <DsInput v-model="form.resultAnnouncedAt" label="Хариу зарлах" type="date" />
        </div>

        <p v-if="derivedInternalDeadline" class="gks-intake-form__derived">
          <DsIcon name="wand-sparkles" :size="15" />
          Манай хугацааг хоосон орхивол
          <strong class="gks-tnum">{{ derivedInternalDeadline.date }}</strong>
          болж автоматаар бодогдоно (сургуулийн хугацаанаас {{ derivedInternalDeadline.days }} хоногийн өмнө).
          Гараар огноо тавибал тохиргоо өөрчлөгдсөн ч дарж бичихгүй.
        </p>

        <h3 class="gks-intake-form__section">Нэмэлт</h3>
        <div class="gks-form-grid">
          <DsInput v-model="form.quota" label="Авах хүний тоо" type="number" placeholder="Мэдэгдэхгүй бол хоосон" />
          <DsInput v-model="form.admissionFeeKrw" label="Элсэлтийн хураамж (₩)" type="number" />
          <DsSelect v-model="form.status" label="Төлөв" :options="STATUS_OPTIONS" />
          <DsInput
            v-model="form.sourceUrl"
            label="Эх сурвалжийн холбоос"
            placeholder="https://…"
            :error="errors.sourceUrl"
          />
        </div>

        <DsTextarea
          v-model="form.requirementNote"
          label="Энэ элсэлтийн онцгой шаардлага"
          :rows="3"
          placeholder="Стандарт материалаас гадна энэ элсэлт юу нэхэж байна вэ"
        />
        <DsTextarea v-model="form.note" label="Дотоод тэмдэглэл" :rows="2" />

        <label class="gks-intake-form__verify">
          <DsCheckbox v-model="form.verified" />
          <span>
            <strong>Сургуулийн сайтаас шалгасан</strong>
            <small>Тэмдэглээгүй элсэлт жагсаалтад "хянагдаагүй" гэж гарна.</small>
          </span>
        </label>

        <p v-if="saveError" class="gks-intake-form__error">{{ saveError }}</p>

        <footer class="gks-form-actions">
          <DsButton
            v-if="editingId"
            variant="ghost"
            icon-left="trash-2"
            :disabled="saving"
            @click="remove"
          >
            Устгах
          </DsButton>
          <DsButton variant="accent" icon-left="check" :loading="saving" @click="save">
            {{ editingId ? 'Хадгалах' : 'Элсэлт нэмэх' }}
          </DsButton>
        </footer>
      </template>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-intake-form__modes { display: flex; gap: var(--sp-2); }
.gks-intake-form__modes button { display: inline-flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-card); color: var(--text-muted); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); cursor: pointer; }
.gks-intake-form__modes button.is-active { border-color: var(--brand-600); background: var(--brand-050); color: var(--brand-700); }
.gks-intake-form__note { color: var(--text-subtle); font-size: var(--fs-body-sm); line-height: 1.6; }
.gks-intake-form__note strong { color: var(--text-body); }
.gks-intake-form__error { margin-top: var(--sp-3); color: var(--red-700); font-size: var(--fs-body-sm); }
.gks-intake-form__research-controls { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-3); margin-block: var(--sp-4); }
.gks-intake-form__levels { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-4); border: 0; }
.gks-intake-form__levels legend { margin-bottom: var(--sp-2); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-intake-form__levels legend span { color: var(--text-subtle); font-weight: var(--fw-regular); }
.gks-intake-form__candidates { display: grid; gap: var(--sp-3); margin-top: var(--sp-4); list-style: none; }
.gks-intake-form__candidates li { padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-card); }
.gks-intake-form__candidate-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-intake-form__candidate-dates { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-intake-form__candidate-dates dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-intake-form__candidate-dates dd { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.gks-intake-form__candidate-note { margin-top: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-intake-form__candidate-warn { color: var(--amber-700); }
.gks-intake-form__candidate-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }
.gks-intake-form__candidate-foot a { display: inline-flex; align-items: center; gap: 4px; color: var(--brand-700); font-size: var(--fs-caption); }
.gks-intake-form__sources { margin-top: var(--sp-4); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-intake-form__sources ul { display: grid; gap: var(--sp-1); margin-top: var(--sp-2); padding-left: var(--sp-4); }
.gks-intake-form__sources a { color: var(--brand-700); word-break: break-all; }
.gks-intake-form__section { margin-top: var(--sp-5); margin-bottom: var(--sp-3); font-size: var(--fs-label); font-weight: var(--fw-semibold); }
.gks-intake-form__derived { display: flex; align-items: flex-start; gap: var(--sp-2); margin-top: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-caption); line-height: 1.6; }
.gks-intake-form__derived strong { color: var(--brand-700); }
.gks-intake-form__verify { display: flex; align-items: flex-start; gap: var(--sp-3); margin-top: var(--sp-4); }
.gks-intake-form__verify small { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
@media (max-width: 720px) {
.gks-intake-form__research-controls { grid-template-columns: 1fr; }
}
</style>

