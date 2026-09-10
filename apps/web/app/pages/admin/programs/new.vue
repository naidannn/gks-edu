<script setup lang="ts">
import type {
  AdminProgram,
  BulkProgramResult,
  ProgramCandidate,
  ProgramLevel,
  ProgramResearchRun,
} from '@gks/shared';

/**
 * Add or edit one programme, by hand or with Gemini's help.
 *
 * The rule the LLM mode is built around is the one the intake search
 * established: **research fills the form, a human saves it.** A candidate is
 * shown next to the page it was read off, and nothing is written until somebody
 * ticks it and presses the button. Tuition is a number a consultant quotes and
 * a family then budgets against — a model writing it into the price list
 * unattended is the failure this feature prevents, not the feature itself.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const api = useApi();
const route = useRoute();
const catalogue = useUniversityCatalogue();

const editingId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null));
useHead({ title: () => (editingId.value ? 'Хөтөлбөр засах · Админ' : 'Шинэ хөтөлбөр · Админ') });

// `?mode=research` is how the school's own page hands off "find this school's
// programmes for me" without the person having to find the tab.
const mode = ref<'manual' | 'research'>(route.query.mode === 'research' ? 'research' : 'manual');
const form = reactive(emptyProgramForm());
// The colleges of whichever school the form has selected — a faculty belongs to
// one school, so this follows the picker rather than loading a global list. It
// has to come after `form`: the watch inside it reads `form.universityId`
// immediately, and above the declaration that is a temporal-dead-zone crash.
const faculties = useFaculties(() => form.universityId);
const errors = ref<ProgramFormErrors>({});
const saving = ref(false);
const saveError = ref<string | null>(null);
const loading = ref(false);
const existing = ref<AdminProgram | null>(null);

const LEVEL_OPTIONS = selectOptions(PROGRAM_LEVEL_LABELS, 'Сонгоно уу');
const LANGUAGE_OPTIONS = selectOptions(INSTRUCTION_LANGUAGE_LABELS);
const TOPIK_OPTIONS = [
  { value: '', label: 'Шаардлагагүй / мэдэгдэхгүй' },
  ...[1, 2, 3, 4, 5, 6].map((value) => ({ value: String(value), label: `TOPIK ${value}` })),
];

const universityOptions = computed(() =>
  toUniversityOptions(catalogue.universities.value, 'Сургууль сонгоно уу'));
const facultyOptions = computed(() => faculties.options.value);

onMounted(async () => {
  catalogue.load();
  if (typeof route.query.universityId === 'string') form.universityId = route.query.universityId;
  if (editingId.value) await loadExisting(editingId.value);
});

async function loadExisting(id: string) {
  loading.value = true;
  try {
    const program = await api.get<AdminProgram>(`/admin/programs/${id}`);
    existing.value = program;
    fillProgramForm(form, program);
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Хөтөлбөрийн мэдээллийг ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
}

/**
 * What the annual figure works out to when only a semester price is typed.
 * Shown rather than stored: the columns keep what the school published, and a
 * derived number written into the database is one nobody can question later.
 */
const derivedAnnual = computed(() => {
  if (form.tuitionPerYearKrw) return null;
  const term = Number(form.tuitionPerTermKrw);
  return form.tuitionPerTermKrw && Number.isFinite(term) ? formatKrw(term * 2) : null;
});

async function save() {
  errors.value = validateProgramForm(form);
  if (Object.keys(errors.value).length) return;

  saving.value = true;
  saveError.value = null;
  try {
    const payload = programPayload(form, { includeUniversity: !editingId.value });
    if (editingId.value) {
      await api.patch<AdminProgram>(`/admin/programs/${editingId.value}`, payload);
    } else {
      await api.post<AdminProgram>('/admin/programs', payload);
    }
    await navigateTo('/admin/programs');
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
    await api.delete(`/admin/programs/${editingId.value}`);
    await navigateTo('/admin/programs');
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Устгаж чадсангүй');
  } finally {
    saving.value = false;
  }
}

/* ----------------------------------------------------------------------- *
 * Gemini research
 * ----------------------------------------------------------------------- */

const researchYear = ref(String(new Date().getFullYear()));
const researchLevels = ref<ProgramLevel[]>([]);
const run = ref<ProgramResearchRun | null>(null);
const researching = ref(false);
const researchError = ref<string | null>(null);
const bulkResult = ref<BulkProgramResult | null>(null);
const bulkSaving = ref(false);
/** Candidates the reviewer has ticked. A run proposes; this is what gets saved. */
const picked = ref<Set<string>>(new Set());
let poll: ReturnType<typeof setInterval> | undefined;

const RESEARCH_YEARS = [-1, 0, 1].map((offset) => {
  const year = new Date().getFullYear() + offset;
  return { value: String(year), label: `${year} оны төлбөр` };
});

function candidateKey(candidate: ProgramCandidate): string {
  return `${candidate.level}:${candidate.nameKo ?? candidate.nameEn ?? ''}`;
}

function toggleLevel(level: ProgramLevel) {
  researchLevels.value = researchLevels.value.includes(level)
    ? researchLevels.value.filter((entry) => entry !== level)
    : [...researchLevels.value, level];
}

function togglePicked(candidate: ProgramCandidate) {
  const key = candidateKey(candidate);
  const next = new Set(picked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  picked.value = next;
}

const candidates = computed(() => run.value?.candidates ?? []);
const pickedCandidates = computed(() => candidates.value.filter((c) => picked.value.has(candidateKey(c))));

function pickAll() {
  picked.value = new Set(candidates.value.map(candidateKey));
}

function pickNone() {
  picked.value = new Set();
}

async function startResearch() {
  if (!form.universityId) {
    researchError.value = 'Эхлээд сургуулиа сонгоно уу.';
    return;
  }
  researching.value = true;
  researchError.value = null;
  bulkResult.value = null;
  picked.value = new Set();
  try {
    run.value = await api.post<ProgramResearchRun>('/admin/programs/research', {
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
 * Three seconds is a compromise: fast enough that the screen feels live, slow
 * enough not to hammer the API for a minute and a half.
 */
function startPolling() {
  clearInterval(poll);
  poll = setInterval(async () => {
    const id = run.value?.id;
    if (!id) return;
    try {
      const updated = await api.get<ProgramResearchRun>(`/admin/programs/research/${id}`);
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

/** Fills the form from one candidate — and only the form. Nothing is saved. */
function applyCandidate(candidate: ProgramCandidate) {
  fillProgramFormFromCandidate(form, candidate);
  mode.value = 'manual';
  errors.value = {};
}

/**
 * Saves the ticked candidates in one go.
 *
 * Still a human save — these are the rows somebody read and chose, and the
 * response says how many were skipped as duplicates, because a school's list
 * gets researched more than once.
 */
async function savePicked() {
  if (!pickedCandidates.value.length) return;
  bulkSaving.value = true;
  researchError.value = null;
  try {
    bulkResult.value = await api.post<BulkProgramResult>('/admin/programs/bulk', {
      universityId: form.universityId,
      researchRunId: run.value?.id,
      programs: pickedCandidates.value.map((candidate) => candidateToBulkEntry(candidate)),
    });
    picked.value = new Set();
  } catch (err) {
    researchError.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    bulkSaving.value = false;
  }
}

function candidateName(candidate: ProgramCandidate): string {
  return candidate.nameKo ?? candidate.nameEn ?? '(нэргүй)';
}

function candidateAnnual(candidate: ProgramCandidate): string {
  const value = annualTuitionKrw(candidate);
  return formatKrw(value) ?? '—';
}
</script>

<template>
  <div class="gks-page gks-page--form gks-prog-form">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">Хөтөлбөр</span>
        <h1 class="gks-page__title">{{ editingId ? 'Хөтөлбөр засах' : 'Шинэ хөтөлбөр нэмэх' }}</h1>
        <p v-if="existing" class="gks-page__hint">
          {{ existing.university.nameMn }} — {{ PROGRAM_LEVEL_LABELS[existing.level] }}
        </p>
      </div>
      <DsButton variant="ghost" icon-left="arrow-left" @click="navigateTo('/admin/programs')">Буцах</DsButton>
    </header>

    <!-- Mode switch: only meaningful when creating; editing is always by hand. -->
    <div v-if="!editingId" class="gks-prog-form__modes" role="tablist">
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
      <p class="gks-prog-form__note">
        Gemini сургуулийн албан ёсны хуудсуудаас (солонгос хэл дээрх 등록금 안내, 학과 소개, 모집요강)
        гадаад оюутан элсэх ангиуд болон тэдгээрийн төлбөрийг хайж олно. Үр дүн нь
        <strong>зөвхөн санал</strong> — та эх сурвалжийг нь хараад, итгэсэн мөрөө сонгож
        өөрөө хадгална. Систем автоматаар юу ч нэмэхгүй.
      </p>

      <div class="gks-prog-form__research-controls">
        <DsCombobox
          v-model="form.universityId"
          label="Сургууль"
          :options="universityOptions"
          :loading="catalogue.loading.value"
        />
        <DsSelect v-model="researchYear" label="Хичээлийн жил" :options="RESEARCH_YEARS" />
      </div>

      <fieldset class="gks-prog-form__levels">
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

      <p v-if="researching" class="gks-prog-form__note">
        Вэб хайлт 30–90 секунд үргэлжилж болно. Хуудсаа хаахгүй байна уу.
      </p>
      <p v-if="researchError" class="gks-prog-form__error">{{ researchError }}</p>

      <p v-if="bulkResult" class="gks-prog-form__ok">
        <DsIcon name="check" :size="15" />
        {{ bulkResult.created }} хөтөлбөр нэмэгдлээ<span v-if="bulkResult.skipped">,
        {{ bulkResult.skipped }} нь өмнө нь бүртгэгдсэн байсан тул алгаслаа</span>.
        <NuxtLink to="/admin/programs">Жагсаалтаас харах</NuxtLink>
      </p>

      <!-- Without a key every run is the same thirteen fixtures. Said once, at
           the top, because a reviewer reads the list of candidates and not the
           note under each of them. -->
      <p v-if="run && run.mock" class="gks-prog-form__mock">
        <DsIcon name="triangle-alert" :size="15" />
        <span>
          <strong>GEMINI_MOCK горим</strong> — жинхэнэ хайлт хийгдээгүй.
          Сургууль хамаарахгүй ижил <strong>13</strong> жишээ мөр буцаж байна, төлбөр нь ч
          зохиомол. Бодит судалгаа хийхийн тулд <code>.env</code>-д
          <code>GEMINI_API_KEY</code> тохируулна уу.
        </span>
      </p>

      <template v-if="run && run.status === 'SUCCEEDED'">
        <div v-if="!candidates.length" class="gks-prog-form__note">
          Энэ сургуулийн ангиудыг олсонгүй. Сургуулийн сайтаас гараар шалгаж оруулна уу.
        </div>

        <template v-else>
          <div class="gks-prog-form__picker">
            <span class="gks-tnum">{{ candidates.length }} санал · {{ pickedCandidates.length }} сонгосон</span>
            <DsButton variant="secondary" size="sm" icon-left="check-check" @click="pickAll">
              Бүгдийг сонгох ({{ candidates.length }})
            </DsButton>
            <DsButton variant="ghost" size="sm" :disabled="!pickedCandidates.length" @click="pickNone">
              Сонголтыг цуцлах
            </DsButton>
            <DsButton
              variant="accent"
              size="sm"
              icon-left="check"
              :loading="bulkSaving"
              :disabled="!pickedCandidates.length"
              @click="savePicked"
            >
              Сонгосон {{ pickedCandidates.length }}-г нэмэх
            </DsButton>
          </div>

          <ul class="gks-prog-form__candidates">
            <li
              v-for="candidate in candidates"
              :key="candidateKey(candidate)"
              :class="{ 'is-picked': picked.has(candidateKey(candidate)) }"
            >
              <div class="gks-prog-form__candidate-head">
                <label class="gks-prog-form__pick">
                  <DsCheckbox
                    :model-value="picked.has(candidateKey(candidate))"
                    @update:model-value="togglePicked(candidate)"
                  />
                  <span>
                    <strong>{{ candidateName(candidate) }}</strong>
                    <small v-if="candidate.nameEn && candidate.nameKo">{{ candidate.nameEn }}</small>
                    <!-- The college, so "all of this school's departments" reads
                         as the school's own structure rather than a flat list. -->
                    <small v-if="candidate.faculty" class="gks-prog-form__candidate-faculty">
                      {{ candidate.faculty }}
                    </small>
                  </span>
                </label>
                <DsBadge :tone="PROGRAM_CONFIDENCE_TONE[candidate.confidence]">
                  Итгэл: {{ PROGRAM_CONFIDENCE_LABELS[candidate.confidence] }}
                </DsBadge>
              </div>

              <dl class="gks-prog-form__candidate-facts">
                <div><dt>Түвшин</dt><dd>{{ PROGRAM_LEVEL_LABELS[candidate.level] }}</dd></div>
                <div>
                  <dt>Улирлын төлбөр</dt>
                  <dd class="gks-tnum">{{ formatKrw(candidate.tuitionPerTermKrw) ?? '—' }}</dd>
                </div>
                <div><dt>Жилээр</dt><dd class="gks-tnum">{{ candidateAnnual(candidate) }}</dd></div>
                <div>
                  <dt>Элсэлтийн хураамж</dt>
                  <dd class="gks-tnum">{{ formatKrw(candidate.admissionFeeKrw) ?? '—' }}</dd>
                </div>
                <div>
                  <dt>Хөнгөлөлт</dt>
                  <dd class="gks-tnum">
                    {{ candidate.scholarshipMaxPercent === null ? '—' : `${candidate.scholarshipMaxPercent}%` }}
                  </dd>
                </div>
                <div><dt>TOPIK</dt><dd class="gks-tnum">{{ candidate.topikLevel ?? '—' }}</dd></div>
                <div><dt>Хичээлийн хэл</dt><dd>{{ INSTRUCTION_LANGUAGE_LABELS[candidate.language] }}</dd></div>
                <div><dt>Үнийн он</dt><dd class="gks-tnum">{{ candidate.tuitionYear ?? 'тодорхойгүй' }}</dd></div>
              </dl>

              <p v-if="candidate.scholarshipNote" class="gks-prog-form__candidate-note">
                {{ candidate.scholarshipNote }}
              </p>
              <p v-if="candidate.note" class="gks-prog-form__candidate-note gks-prog-form__candidate-warn">
                {{ candidate.note }}
              </p>

              <footer class="gks-prog-form__candidate-foot">
                <a v-if="candidate.sourceUrl" :href="candidate.sourceUrl" target="_blank" rel="noopener noreferrer">
                  <DsIcon name="external-link" :size="14" /> Эх сурвалж
                </a>
                <span v-else class="gks-prog-form__candidate-warn">Эх сурвалж заагаагүй</span>
                <DsButton size="sm" variant="secondary" icon-left="arrow-down-to-line" @click="applyCandidate(candidate)">
                  Формд буулгах
                </DsButton>
              </footer>
            </li>
          </ul>
        </template>

        <details v-if="run.sources.length" class="gks-prog-form__sources">
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
    <DsCard :title="editingId ? 'Хөтөлбөрийн мэдээлэл' : 'Хөтөлбөрийн мэдээлэл (хянаад хадгална уу)'">
      <div v-if="loading" class="gks-prog-form__note">Ачаалж байна…</div>

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
        </div>

        <h3 class="gks-prog-form__section">Нэршил</h3>
        <div class="gks-form-grid">
          <DsInput v-model="form.nameMn" label="Монгол нэр" :error="errors.nameMn" />
          <DsInput v-model="form.nameEn" label="Англи нэр" placeholder="Business Administration" />
          <DsInput v-model="form.nameKo" label="Солонгос нэр" placeholder="경영학과" />
        </div>

        <div class="gks-form-grid">
          <DsSelect
            v-model="form.facultyId"
            label="Танхим (단과대학)"
            :options="facultyOptions"
            :loading="faculties.loading.value"
            :disabled="!form.universityId"
          />
          <DsInput
            v-model="form.facultyName"
            label="Эсвэл шинэ танхимын нэр"
            placeholder="공과대학"
            :disabled="Boolean(form.facultyId)"
          />
        </div>
        <p class="gks-prog-form__hint">
          Танхим заавал биш — магистр, докторын анги ихэвчлэн 대학원-д багтдаг тул хоосон
          орхиж болно. Жагсаалтад байхгүй танхимын нэрийг бичвэл шинээр үүсгэнэ.
        </p>

        <h3 class="gks-prog-form__section">Сургалтын төлбөр</h3>
        <div class="gks-form-grid">
          <DsInput
            v-model="form.tuitionPerTermKrw"
            label="Нэг улирлын төлбөр (₩)"
            type="number"
            placeholder="Солонгосын сургуулиуд ихэвчлэн ингэж зарладаг"
          />
          <DsInput
            v-model="form.tuitionPerYearKrw"
            label="Жилийн төлбөр (₩)"
            type="number"
            placeholder="Сургууль жилээр зарласан бол"
            :error="errors.tuitionPerYearKrw"
          />
          <DsInput v-model="form.admissionFeeKrw" label="Элсэлтийн хураамж 입학금 (₩)" type="number" />
          <DsInput v-model="form.tuitionYear" label="Аль оны үнэ вэ" type="number" :error="errors.tuitionYear" />
        </div>

        <p v-if="derivedAnnual" class="gks-prog-form__derived">
          <DsIcon name="wand-sparkles" :size="15" />
          Жилийн төлбөрийг хоосон орхивол хоёр улирлаар тооцоод
          <strong class="gks-tnum">{{ derivedAnnual }}</strong> гэж харуулна. Сургууль өөрөө
          жилээр зарласан бол тэр тоог нь бичээрэй.
        </p>

        <div class="gks-form-grid">
          <DsInput
            v-model="form.scholarshipMaxPercent"
            label="Хамгийн их хөнгөлөлт (%)"
            type="number"
            placeholder="30, 50, 70…"
          />
          <DsInput v-model="form.durationYears" label="Хугацаа (жил)" type="number" step="0.5" />
        </div>
        <DsTextarea
          v-model="form.scholarshipNote"
          label="Хөнгөлөлтийн нөхцөл"
          :rows="2"
          placeholder="Юунаас хамаарч хэдэн хувь өгдгийг бичнэ үү"
        />

        <h3 class="gks-prog-form__section">Элсэлтийн шаардлага</h3>
        <div class="gks-form-grid">
          <DsSelect v-model="form.topikLevel" label="TOPIK" :options="TOPIK_OPTIONS" />
          <DsInput v-model="form.ieltsScore" label="IELTS" type="number" step="0.5" />
          <DsSelect v-model="form.language" label="Хичээлийн хэл" :options="LANGUAGE_OPTIONS" />
        </div>
        <DsTextarea v-model="form.otherRequirements" label="Бусад шаардлага" :rows="2" />

        <h3 class="gks-prog-form__section">Эх сурвалж, төлөв</h3>
        <DsInput
          v-model="form.sourceUrl"
          label="Эх сурвалжийн холбоос"
          placeholder="https://…"
          :error="errors.sourceUrl"
        />
        <DsTextarea v-model="form.internalNote" label="Дотоод тэмдэглэл" :rows="2" />

        <label class="gks-prog-form__check">
          <DsCheckbox v-model="form.acceptsInternational" />
          <span>
            <strong>Гадаад оюутан элсүүлдэг</strong>
            <small>Тэмдэглээгүй хөтөлбөр нийтийн хайлтад огт гарахгүй.</small>
          </span>
        </label>
        <label class="gks-prog-form__check">
          <DsCheckbox v-model="form.isPublished" />
          <span>
            <strong>Нийтлэх</strong>
            <small>Тэмдэглээгүй бол зөвхөн ажилтан харна.</small>
          </span>
        </label>
        <label class="gks-prog-form__check">
          <DsCheckbox v-model="form.verified" />
          <span>
            <strong>Сургуулийн сайтаас шалгасан</strong>
            <small>Тэмдэглээгүй хөтөлбөр жагсаалтад "хянагдаагүй" гэж гарна.</small>
          </span>
        </label>

        <p v-if="saveError" class="gks-prog-form__error">{{ saveError }}</p>

        <footer class="gks-form-actions">
          <DsButton v-if="editingId" variant="ghost" icon-left="trash-2" :disabled="saving" @click="remove">
            Устгах
          </DsButton>
          <DsButton variant="accent" icon-left="check" :loading="saving" @click="save">
            {{ editingId ? 'Хадгалах' : 'Хөтөлбөр нэмэх' }}
          </DsButton>
        </footer>
      </template>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-prog-form__modes { display: flex; gap: var(--sp-2); }
.gks-prog-form__modes button { display: inline-flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-card); color: var(--text-muted); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); cursor: pointer; }
.gks-prog-form__modes button.is-active { border-color: var(--brand-600); background: var(--brand-050); color: var(--brand-700); }
.gks-prog-form__note { color: var(--text-subtle); font-size: var(--fs-body-sm); line-height: 1.6; }
.gks-prog-form__note strong { color: var(--text-body); }
.gks-prog-form__hint { margin-top: var(--sp-2); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-prog-form__error { margin-top: var(--sp-3); color: var(--red-700); font-size: var(--fs-body-sm); }
.gks-prog-form__ok { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3); color: var(--green-700); font-size: var(--fs-body-sm); }
.gks-prog-form__research-controls { display: grid; grid-template-columns: 2fr 1fr; gap: var(--sp-3); margin-block: var(--sp-4); }
.gks-prog-form__levels { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-4); border: 0; }
.gks-prog-form__levels legend { margin-bottom: var(--sp-2); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-prog-form__levels legend span { color: var(--text-subtle); font-weight: var(--fw-regular); }
.gks-prog-form__picker { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-top: var(--sp-4); padding: var(--sp-3); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-sunken); }
.gks-prog-form__picker > span:first-child { margin-right: auto; color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-prog-form__candidates { display: grid; gap: var(--sp-3); margin-top: var(--sp-3); list-style: none; }
.gks-prog-form__candidates li { padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-card); }
.gks-prog-form__candidates li.is-picked { border-color: var(--brand-600); background: var(--brand-050); }
.gks-prog-form__candidate-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); }
.gks-prog-form__pick { display: flex; align-items: flex-start; gap: var(--sp-3); cursor: pointer; }
.gks-prog-form__pick small { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-prog-form__candidate-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-prog-form__candidate-facts dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-prog-form__candidate-facts dd { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); }
.gks-prog-form__candidate-faculty { color: var(--text-subtle); }

/* Not an error — the feature is working exactly as configured. It is a warning
   about what the numbers below are worth. */
.gks-prog-form__mock {
  display: flex;
  gap: var(--sp-2);
  padding: var(--sp-3);
  border-radius: var(--radius-1);
  border: var(--border-hair) solid var(--amber-100);
  background: var(--amber-050);
  color: var(--amber-700);
  font-size: var(--fs-caption);
  line-height: var(--lh-loose);
}
.gks-prog-form__mock .gks-icon { flex: none; margin-top: 2px; }
.gks-prog-form__mock code {
  padding: 1px 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-card);
  font-family: var(--font-mono);
}
.gks-prog-form__candidate-note { margin-top: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-prog-form__candidate-warn { color: var(--amber-700); }
.gks-prog-form__candidate-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }
.gks-prog-form__candidate-foot a { display: inline-flex; align-items: center; gap: 4px; color: var(--brand-700); font-size: var(--fs-caption); }
.gks-prog-form__sources { margin-top: var(--sp-4); color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-prog-form__sources ul { display: grid; gap: var(--sp-1); margin-top: var(--sp-2); padding-left: var(--sp-4); }
.gks-prog-form__sources a { color: var(--brand-700); word-break: break-all; }
.gks-prog-form__section { margin-top: var(--sp-5); margin-bottom: var(--sp-3); font-size: var(--fs-label); font-weight: var(--fw-semibold); }
.gks-prog-form__derived { display: flex; align-items: flex-start; gap: var(--sp-2); margin-top: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-sunken); color: var(--text-muted); font-size: var(--fs-caption); line-height: 1.6; }
.gks-prog-form__derived strong { color: var(--brand-700); }
.gks-prog-form__check { display: flex; align-items: flex-start; gap: var(--sp-3); margin-top: var(--sp-4); }
.gks-prog-form__check small { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
@media (max-width: 720px) {
.gks-prog-form__research-controls { grid-template-columns: 1fr; }
}
</style>
