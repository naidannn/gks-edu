<script setup lang="ts">
import type {
  AdminIntakeTerm,
  AdminUniversityDetail,
  AdminUniversityProgram,
  GksScoreParts,
  IntakeStatus,
  ProgramLevel,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';
import { emptyUniversityForm, fillFromUniversity, universityPayload, validateUniversityForm } from '~/utils/university-form';

/**
 * One university: the record itself (1A-26), its programmes and its intake
 * terms (1A-27). The programme and intake tables are the reason this page is
 * more than a form — both are empty for the whole imported catalogue.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const route = useRoute();
const auth = useAuthStore();
const api = useApi();
const id = computed(() => String(route.params.id));

const university = ref<AdminUniversityDetail | null>(null);
const pending = ref(true);
const loadError = ref(false);

const form = reactive(emptyUniversityForm());
const errors = reactive<Record<string, string>>({});
const slugLocked = ref(true);
const saving = ref(false);
const saveError = ref<string | null>(null);
const saved = ref(false);

async function load() {
  pending.value = true;
  loadError.value = false;
  try {
    const found = await api.get<AdminUniversityDetail>(`/admin/universities/${id.value}`);
    university.value = found;
    fillFromUniversity(form, found);
  } catch {
    loadError.value = true;
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function save() {
  saveError.value = null;
  saved.value = false;
  if (!validateUniversityForm(form, errors)) {
    saveError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  saving.value = true;
  try {
    const updated = await api.patch<AdminUniversityDetail>(`/admin/universities/${id.value}`, universityPayload(form));
    university.value = updated;
    fillFromUniversity(form, updated);
    slugLocked.value = true;
    saved.value = true;
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Хадгалахад алдаа гарлаа.');
  } finally {
    saving.value = false;
  }
}

/** Publish/unpublish without scrolling to the bottom of the form. */
async function togglePublished() {
  if (!university.value) return;
  saveError.value = null;
  saving.value = true;
  try {
    const updated = await api.patch<AdminUniversityDetail>(`/admin/universities/${id.value}`, {
      isPublished: !university.value.isPublished,
    });
    university.value = updated;
    form.isPublished = updated.isPublished;
  } catch (err) {
    saveError.value = apiErrorMessage(err, 'Төлөв солиход алдаа гарлаа.');
  } finally {
    saving.value = false;
  }
}

// ── Programmes (1A-27) ─────────────────────────────────────────────────────
const LEVEL_OPTIONS = selectOptions(PROGRAM_LEVEL_LABELS);

/**
 * Programmes are edited on their own screen, not inline here.
 *
 * A programme now carries tuition with the year it was read off, a canonical
 * subject and a source link — more than fits in a sub-form, and it is the same
 * record whether it is reached from this school or from the cross-school list.
 * One editor for it means one set of rules about what a price without a year
 * means (`/admin/programs`).
 */
function editProgram(program: AdminUniversityProgram) {
  return navigateTo(`/admin/programs/new?id=${program.id}`);
}

function addProgram() {
  return navigateTo(`/admin/programs/new?universityId=${id.value}`);
}

/** Straight into the Gemini mode, which is how an empty school gets filled. */
function researchPrograms() {
  return navigateTo(`/admin/programs/new?universityId=${id.value}&mode=research`);
}

// ── Faculties (танхим) ─────────────────────────────────────────────────────
//
// A research run creates these from whatever the prospectus said, which means
// most of them start life named `공과대학`. Without somewhere to word them in
// Mongolian they stay Korean forever, so this is a rename list first and a
// CRUD screen second.
const faculties = useFaculties(id);
const facultyDraft = ref<Record<string, string>>({});
const facultySaving = ref<string | null>(null);
const facultyError = ref<string | null>(null);
const newFaculty = ref('');

watch(faculties.items, (items) => {
  facultyDraft.value = Object.fromEntries(items.map((faculty) => [faculty.id, faculty.nameMn]));
});

async function renameFaculty(facultyId: string) {
  const nameMn = (facultyDraft.value[facultyId] ?? '').trim();
  const current = faculties.items.value.find((faculty) => faculty.id === facultyId);
  if (!nameMn || !current || nameMn === current.nameMn) return;

  facultySaving.value = facultyId;
  facultyError.value = null;
  try {
    await api.patch(`/admin/faculties/${facultyId}`, { nameMn });
    await faculties.load();
  } catch (err) {
    facultyError.value = apiErrorMessage(err, 'Танхимын нэрийг хадгалж чадсангүй');
  } finally {
    facultySaving.value = null;
  }
}

async function addFaculty() {
  const nameMn = newFaculty.value.trim();
  if (!nameMn) return;

  facultySaving.value = 'new';
  facultyError.value = null;
  try {
    await api.post('/admin/faculties', { universityId: id.value, nameMn });
    newFaculty.value = '';
    await faculties.load();
  } catch (err) {
    facultyError.value = apiErrorMessage(err, 'Танхим нэмж чадсангүй');
  } finally {
    facultySaving.value = null;
  }
}

/**
 * Deleting a college does not delete its departments — they come back as
 * "танхимгүй". The confirmation says so, because the opposite is what somebody
 * pressing this button is afraid of.
 */
async function removeFaculty(facultyId: string, programCount: number) {
  const suffix = programCount
    ? ` ${programCount} анги нь "танхимгүй" болж үлдэнэ, устахгүй.`
    : '';
  if (!globalThis.confirm(`Энэ танхимыг устгах уу?${suffix}`)) return;

  facultySaving.value = facultyId;
  facultyError.value = null;
  try {
    await api.delete(`/admin/faculties/${facultyId}`);
    await faculties.load();
  } catch (err) {
    facultyError.value = apiErrorMessage(err, 'Танхимыг устгаж чадсангүй');
  } finally {
    facultySaving.value = null;
  }
}

const text = (value: string) => (value.trim() ? value.trim() : null);

// ── Intake terms (1A-27) ───────────────────────────────────────────────────
const MONTH_OPTIONS = [3, 6, 9, 12].map((m) => ({ value: String(m), label: INTAKE_MONTH_LABELS[m] as string }));
const INTAKE_STATUS_OPTIONS = selectOptions(INTAKE_STATUS_LABELS);

const blankIntake = () => ({
  level: 'BACHELOR' as ProgramLevel,
  year: String(new Date().getFullYear() + 1),
  month: '3',
  applicationDeadline: '',
  status: 'PLANNED' as IntakeStatus,
  note: '',
});
const intakeDraft = reactive(blankIntake());
const intakeFormOpen = ref(false);
const editingIntakeId = ref<string | null>(null);
const intakeError = ref<string | null>(null);
const intakeSaving = ref(false);

function openIntakeForm(intake?: AdminIntakeTerm) {
  Object.assign(intakeDraft, blankIntake());
  intakeError.value = null;
  editingIntakeId.value = intake?.id ?? null;
  if (intake) {
    Object.assign(intakeDraft, {
      level: intake.level,
      year: String(intake.year),
      month: String(intake.month),
      applicationDeadline: intake.applicationDeadline ? intake.applicationDeadline.slice(0, 10) : '',
      status: intake.status,
      note: intake.note ?? '',
    });
  }
  intakeFormOpen.value = true;
}

async function saveIntake() {
  intakeSaving.value = true;
  intakeError.value = null;
  try {
    const payload = {
      level: intakeDraft.level,
      year: Number(intakeDraft.year),
      month: Number(intakeDraft.month),
      applicationDeadline: intakeDraft.applicationDeadline || null,
      status: intakeDraft.status,
      note: text(intakeDraft.note),
    };
    if (editingIntakeId.value) {
      await api.patch(`/admin/universities/${id.value}/intakes/${editingIntakeId.value}`, payload);
    } else {
      await api.post(`/admin/universities/${id.value}/intakes`, payload);
    }
    intakeFormOpen.value = false;
    await load();
  } catch (err) {
    intakeError.value = apiErrorMessage(err, 'Элсэлтийн улирал хадгалж чадсангүй.');
  } finally {
    intakeSaving.value = false;
  }
}

async function removeIntake(intake: AdminIntakeTerm) {
  intakeError.value = null;
  try {
    await api.delete(`/admin/universities/${id.value}/intakes/${intake.id}`);
    await load();
  } catch (err) {
    intakeError.value = apiErrorMessage(err, 'Элсэлтийн улирал устгаж чадсангүй.');
  }
}

// ── Delete (admin only) ────────────────────────────────────────────────────
const confirmDelete = ref(false);
const deleting = ref(false);
const deleteError = ref<string | null>(null);

/** Sum of everything that would lose its link — the API refuses if it is > 0. */
const referenceCount = computed(() => {
  const counts = university.value?._count;
  if (!counts) return 0;
  return counts.cases + counts.clients + counts.applications + counts.requirementRules;
});

async function remove() {
  deleting.value = true;
  deleteError.value = null;
  try {
    await api.delete(`/admin/universities/${id.value}`);
    await navigateTo('/admin/universities');
  } catch (err) {
    deleteError.value = apiErrorMessage(err, 'Устгаж чадсангүй.');
    confirmDelete.value = false;
  } finally {
    deleting.value = false;
  }
}

/**
 * The five components behind `gksScore`, labelled. Empty until the first
 * recompute has run for this school (1A-30).
 */
const SCORE_PART_LABELS: [keyof GksScoreParts, string][] = [
  ['base', 'Үндсэн рэйтинг (THE)'],
  ['partnership', 'Агентын гэрээ'],
  ['fit', 'Монголд тохирох байдал'],
  ['demand', 'Эрэлт ба амжилт'],
  ['practical', 'Практик хүчин зүйл'],
];

const scoreParts = computed(() => {
  const parts = university.value?.gksScoreParts;
  if (!parts) return [];
  return SCORE_PART_LABELS.map(([key, label]) => ({ label, value: parts[key] }));
});

function intakeTone(status: IntakeStatus): BadgeTone {
  if (status === 'OPEN') return 'success';
  if (status === 'CLOSED') return 'neutral';
  return 'info';
}

useHead({ title: () => `${universityName(university.value, 'Сургууль')} · CRM` });
</script>

<template>
  <div class="gks-page gks-page--form">
    <DsCard v-if="loadError" accent><p>Сургуулийн мэдээллийг ачаалж чадсангүй.</p></DsCard>
    <p v-else-if="pending && !university" class="gks-form-page__loading">Ачаалж байна…</p>

    <template v-else-if="university">
      <header class="gks-page__head">
        <div>
          <NuxtLink to="/admin/universities" class="gks-page__back">
            <DsIcon name="arrow-left" :size="16" /> Сургуулийн жагсаалт
          </NuxtLink>
          <h1 class="gks-page__title">{{ universityName(university) }}</h1>
          <p class="gks-page__hint">
            {{ university.nameMn }} · {{ university.nameKo }} · {{ university.cityMn }}, {{ university.regionMn }}
          </p>
          <div class="gks-form-page__badges">
            <DsBadge :tone="university.isPublished ? 'success' : 'neutral'">
              {{ university.isPublished ? 'Нийтлэгдсэн' : 'Ноорог' }}
            </DsBadge>
            <DsBadge :tone="AGENT_CONTRACT_STATUS_TONES[university.agentContractStatus]">
              {{ AGENT_CONTRACT_STATUS_LABELS[university.agentContractStatus] }}
            </DsBadge>
            <DsBadge v-if="university.acceptsLanguagePrep" tone="info">Хэлний бэлтгэл</DsBadge>
            <DsBadge v-if="university.isGksEligible" tone="accent">GKS</DsBadge>
          </div>
        </div>
        <div class="gks-page__actions">
          <NuxtLink
            v-if="university.isPublished"
            :to="`/universities/${university.slug}`"
            target="_blank"
            class="gks-page__back"
          >
            <DsIcon name="external-link" :size="16" /> Нийтийн хуудас
          </NuxtLink>
          <DsButton
            :variant="university.isPublished ? 'secondary' : 'accent'"
            :icon-left="university.isPublished ? 'eye-off' : 'eye'"
            :loading="saving"
            @click="togglePublished"
          >
            {{ university.isPublished ? 'Нийтлэлээс хасах' : 'Нийтлэх' }}
          </DsButton>
        </div>
      </header>

      <!-- ── The record itself ─────────────────────────────────────────── -->
      <form class="gks-form-body" @submit.prevent="save">
        <UniversityAdminFields v-model="form" :errors="errors" :slug-locked="slugLocked" />

        <DsCard v-if="saveError" accent><p class="gks-form-page__error">{{ saveError }}</p></DsCard>

        <div class="gks-form-actions">
          <DsButton v-if="slugLocked" variant="ghost" icon-left="unlock" @click="slugLocked = false">
            Slug засах
          </DsButton>
          <span v-if="saved" class="gks-form-page__saved"><DsIcon name="check" :size="16" /> Хадгаллаа</span>
          <DsButton variant="secondary" :disabled="saving" @click="load">Буцаах</DsButton>
          <DsButton type="submit" variant="accent" icon-left="save" :loading="saving">Хадгалах</DsButton>
        </div>
      </form>

      <!-- ── Faculties ─────────────────────────────────────────────────── -->
      <DsCard title="Танхим" :eyebrow="`${faculties.items.value.length} танхим`">
        <p class="gks-form-page__hint">
          Сургуулийн 단과대학-ууд. Судалгаанаас солонгос нэрээрээ үүсдэг тул монголоор нэрлэж
          өгнө үү — жагсаалт, картан дээр энэ нэр гарна.
        </p>
        <p v-if="facultyError" class="gks-form-page__error">{{ facultyError }}</p>

        <ul v-if="faculties.items.value.length" class="gks-faculties">
          <li v-for="faculty in faculties.items.value" :key="faculty.id">
            <DsInput
              v-model="facultyDraft[faculty.id]"
              :label="faculty.nameKo ?? faculty.nameEn ?? 'Танхим'"
              @blur="renameFaculty(faculty.id)"
            />
            <span class="gks-faculties__count gks-tnum">{{ faculty.programCount }} анги</span>
            <DsIconButton
              icon="trash-2"
              label="Танхимыг устгах"
              variant="outline"
              size="sm"
              :disabled="facultySaving === faculty.id"
              @click="removeFaculty(faculty.id, faculty.programCount)"
            />
          </li>
        </ul>
        <p v-else class="gks-form-page__empty">
          Танхим бүртгэгдээгүй байна. Ангиудыг судлуулах эсвэл гараар нэмэхэд танхим нь
          өөрөө үүснэ.
        </p>

        <form class="gks-faculties__add" @submit.prevent="addFaculty">
          <DsInput v-model="newFaculty" label="Шинэ танхим" placeholder="Инженерийн танхим" />
          <DsButton type="submit" variant="secondary" icon-left="plus" :loading="facultySaving === 'new'">
            Нэмэх
          </DsButton>
        </form>
      </DsCard>

      <!-- ── Programmes ────────────────────────────────────────────────── -->
      <DsCard title="Хөтөлбөр, төлбөр" :eyebrow="`${university.programs.length} хөтөлбөр`">
        <template #action>
          <DsButton variant="ghost" size="sm" icon-left="sparkles" @click="researchPrograms">
            Интернэтээс судлах
          </DsButton>
          <DsButton variant="secondary" size="sm" icon-left="plus" @click="addProgram">Хөтөлбөр нэмэх</DsButton>
        </template>

        <p v-if="!university.programs.length" class="gks-form-page__empty">
          Хөтөлбөр бүртгэгдээгүй байна. Хөтөлбөргүй бол каталогийн «боловсролын түвшин» шүүлтүүр
          энэ сургуулийг олохгүй, мэргэжлээр хайхад ч гарч ирэхгүй. «Интернэтээс судлах» дарвал
          Gemini энэ сургуулийн ангиуд болон төлбөрийг олж санал болгоно.
        </p>

        <div v-else class="gks-table-wrap gks-table-wrap--auto">
          <table class="gks-table">
            <thead>
              <tr>
                <th>Түвшин</th>
                <th>Нэр</th>
                <th>Танхим</th>
                <th class="gks-table__num">Улирлын төлбөр</th>
                <th class="gks-table__num">Жилийн төлбөр</th>
                <th class="gks-table__num">TOPIK</th>
                <th>Төлөв</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in university.programs" :key="p.id">
                <td>{{ PROGRAM_LEVEL_LABELS[p.level] }}</td>
                <td>
                  <span class="gks-cell-name">{{ p.nameMn }}</span>
                  <span v-if="p.nameKo" class="gks-cell-sub">{{ p.nameKo }}</span>
                  <span v-else-if="p.nameEn" class="gks-cell-sub">{{ p.nameEn }}</span>
                </td>
                <td>
                  <DsBadge v-if="p.faculty" tone="neutral">{{ p.faculty.nameKo ?? p.faculty.nameMn }}</DsBadge>
                  <DsBadge v-else tone="warning">Танхимгүй</DsBadge>
                </td>
                <td class="gks-tnum gks-table__num">{{ formatKrw(p.tuitionPerTermKrw) ?? '—' }}</td>
                <td class="gks-tnum gks-table__num">
                  {{ formatKrw(annualTuitionKrw(p)) ?? '—' }}
                  <span class="gks-cell-sub">{{ tuitionYearLabel(p.tuitionYear) }}</span>
                </td>
                <td class="gks-tnum gks-table__num">{{ p.topikLevel ?? '—' }}</td>
                <td>
                  <DsBadge :tone="p.isPublished ? 'success' : 'neutral'">
                    {{ p.isPublished ? 'Нийтэд' : 'Нуусан' }}
                  </DsBadge>
                  <DsBadge v-if="!p.verifiedAt" tone="warning">Хянагдаагүй</DsBadge>
                </td>
                <td class="gks-table__actions">
                  <DsIconButton icon="pencil" label="Засах" size="sm" @click="editProgram(p)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DsCard>

      <!-- ── Intake terms ──────────────────────────────────────────────── -->
      <DsCard title="Элсэлтийн улирал" :eyebrow="`${university.intakes.length} улирал`">
        <template #action>
          <DsButton variant="secondary" size="sm" icon-left="plus" @click="openIntakeForm()">Улирал нэмэх</DsButton>
        </template>

        <p v-if="intakeError" class="gks-form-page__error">{{ intakeError }}</p>

        <div v-if="intakeFormOpen" class="gks-sub-form">
          <div class="gks-form-grid">
            <DsSelect v-model="intakeDraft.level" label="Түвшин" :options="LEVEL_OPTIONS" />
            <DsInput v-model="intakeDraft.year" label="Он" type="number" />
            <DsSelect v-model="intakeDraft.month" label="Элсэлтийн сар" :options="MONTH_OPTIONS" />
            <DsInput v-model="intakeDraft.applicationDeadline" label="Материал хүлээн авах эцсийн хугацаа" type="date" />
            <DsSelect v-model="intakeDraft.status" label="Төлөв" :options="INTAKE_STATUS_OPTIONS" />
          </div>
          <DsTextarea v-model="intakeDraft.note" label="Тэмдэглэл" :rows="2" />
          <div class="gks-form-actions">
            <span class="gks-form-actions__spacer" />
            <DsButton variant="secondary" size="sm" @click="intakeFormOpen = false">Болих</DsButton>
            <DsButton variant="accent" size="sm" icon-left="save" :loading="intakeSaving" @click="saveIntake">
              {{ editingIntakeId ? 'Хадгалах' : 'Нэмэх' }}
            </DsButton>
          </div>
        </div>

        <p v-if="!university.intakes.length" class="gks-form-page__empty">
          Элсэлтийн улирал бүртгэгдээгүй байна. Үйлчилгээ эхлүүлэхэд улирал сонгох шаардлагатай.
        </p>

        <div v-else class="gks-table-wrap gks-table-wrap--auto">
          <table class="gks-table">
            <thead>
              <tr>
                <th>Түвшин</th>
                <th>Элсэлт</th>
                <th>Эцсийн хугацаа</th>
                <th>Төлөв</th>
                <th>Тэмдэглэл</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in university.intakes" :key="t.id">
                <td>{{ PROGRAM_LEVEL_LABELS[t.level] }}</td>
                <td class="gks-tnum">{{ t.year }} · {{ INTAKE_MONTH_LABELS[t.month] }}</td>
                <td class="gks-tnum">{{ formatDate(t.applicationDeadline) }}</td>
                <td><DsBadge :tone="intakeTone(t.status)">{{ INTAKE_STATUS_LABELS[t.status] }}</DsBadge></td>
                <td>{{ t.note ?? '—' }}</td>
                <td class="gks-table__actions">
                  <DsIconButton icon="pencil" label="Засах" size="sm" @click="openIntakeForm(t)" />
                  <DsIconButton icon="trash-2" label="Устгах" size="sm" @click="removeIntake(t)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DsCard>

      <!-- ── GKS ranking, read only (1A-30) ────────────────────────────── -->
      <DsCard title="GKS эрэмбэ" eyebrow="Тооцоолсон">
        <p class="gks-page__hint">
          Каталог болон хайлт энэ эрэмбээр эрэмбэлэгддэг. Оноог систем тооцоолох тул
          гараар засах цорын ганц зүйл нь дээрх «Рэйтинг» хэсгийн засварын оноо.
          <NuxtLink to="/admin/universities/ranking" class="gks-form-page__link">Жинг тохируулах</NuxtLink>
        </p>
        <dl class="gks-meta">
          <div>
            <dt>Эрэмбэ</dt>
            <dd class="gks-tnum">{{ university.gksRank ? `#${university.gksRank}` : UNKNOWN_LABEL }}</dd>
          </div>
          <div>
            <dt>Оноо</dt>
            <dd class="gks-tnum">{{ university.gksScore?.toFixed(2) ?? UNKNOWN_LABEL }}</dd>
          </div>
          <div>
            <dt>Гар засвар</dt>
            <dd class="gks-tnum">
              {{ university.gksRankBoost ? `${university.gksRankBoost > 0 ? '+' : ''}${university.gksRankBoost}` : '0' }}
            </dd>
          </div>
          <div>
            <dt>Сүүлд тооцоолсон</dt>
            <dd class="gks-tnum">
              {{ university.gksScoredAt ? formatDate(university.gksScoredAt) : UNKNOWN_LABEL }}
            </dd>
          </div>
          <div v-for="part in scoreParts" :key="part.label">
            <dt>{{ part.label }}</dt>
            <dd class="gks-tnum">{{ part.value.toFixed(0) }} / 100</dd>
          </div>
        </dl>
      </DsCard>

      <!-- ── Importer-owned, read only ─────────────────────────────────── -->
      <DsCard title="Импортын мэдээлэл" eyebrow="Зөвхөн харах">
        <p class="gks-page__hint">
          Амьдралын зардал ба чанарын тэмдэглэгээг импорт хөтөлдөг — энд гараар засдаггүй.
        </p>
        <dl class="gks-meta">
          <div><dt>Бүртгэсэн</dt><dd class="gks-tnum">{{ formatDate(university.createdAt) }}</dd></div>
          <div><dt>Сүүлд өөрчилсөн</dt><dd class="gks-tnum">{{ formatDate(university.updatedAt) }}</dd></div>
          <div><dt>Хадгалсан хэрэглэгч</dt><dd class="gks-tnum">{{ university._count.savedBy }}</dd></div>
          <div><dt>Холбоотой үйлчилгээ</dt><dd class="gks-tnum">{{ university._count.cases }}</dd></div>
          <div><dt>Холбоотой мэдүүлэг</dt><dd class="gks-tnum">{{ university._count.applications }}</dd></div>
          <div><dt>Материалын дүрэм</dt><dd class="gks-tnum">{{ university._count.requirementRules }}</dd></div>
          <div>
            <dt>Амьдралын зардал</dt>
            <dd>
              {{ university.livingCost?.tierLabelMn
                ?? (university.livingCost ? 'Бүртгэлтэй' : UNKNOWN_LABEL) }}
            </dd>
          </div>
        </dl>
      </DsCard>

      <!-- ── Danger zone ───────────────────────────────────────────────── -->
      <DsCard v-if="auth.isAdmin" title="Сургууль устгах" accent>
        <p class="gks-page__hint">
          <template v-if="referenceCount > 0">
            Энэ сургууль {{ referenceCount }} бичлэгт холбогдсон тул устгах боломжгүй.
            Оронд нь «Нийтлэлээс хасах» товчийг ашиглана уу.
          </template>
          <template v-else>
            Устгасан сургуулийг сэргээх боломжгүй. Хөтөлбөр, элсэлтийн улирал нь хамт устана.
          </template>
        </p>
        <p v-if="deleteError" class="gks-form-page__error">{{ deleteError }}</p>
        <div class="gks-form-actions">
          <template v-if="confirmDelete">
            <span class="gks-form-page__confirm">«{{ universityName(university) }}»-г бүрмөсөн устгах уу?</span>
            <DsButton variant="secondary" @click="confirmDelete = false">Болих</DsButton>
            <DsButton variant="danger" icon-left="trash-2" :loading="deleting" @click="remove">Тийм, устга</DsButton>
          </template>
          <DsButton
            v-else
            variant="danger"
            icon-left="trash-2"
            :disabled="referenceCount > 0"
            @click="confirmDelete = true"
          >
            Устгах
          </DsButton>
        </div>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-form-page__link { color: var(--text-strong); text-decoration: underline; text-underline-offset: 2px; }
.gks-form-page__badges { display: flex; gap: var(--sp-2); margin-top: var(--sp-3); flex-wrap: wrap; }
.gks-form-page__loading { color: var(--text-muted); }
.gks-form-page__error { color: var(--danger-fg); font-size: var(--fs-body-sm); margin-bottom: var(--sp-3); }
.gks-form-page__empty { color: var(--text-muted); font-size: var(--fs-body-sm); }

/* Танхим: a rename list. The Korean name is the label, the editable field is
   ours — so the two are never confused for one another. */
.gks-faculties { display: grid; gap: var(--sp-3); margin-top: var(--sp-4); list-style: none; }
.gks-faculties > li { display: flex; align-items: flex-end; gap: var(--sp-3); }
.gks-faculties > li > :first-child { flex: 1 1 auto; min-width: 0; }
.gks-faculties__count { flex: none; padding-bottom: 10px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-faculties__add { display: flex; align-items: flex-end; gap: var(--sp-3); margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-faculties__add > :first-child { flex: 1 1 auto; }
@media (max-width: 640px) {
  .gks-faculties > li,
  .gks-faculties__add { flex-wrap: wrap; }
}
.gks-form-page__saved { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-form-page__confirm { margin-right: auto; font-size: var(--fs-body-sm); }
.gks-sub-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
  padding: var(--sp-4);
  margin-bottom: var(--sp-5);
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
}
.gks-table__actions > * + * { margin-left: var(--sp-1); }
.gks-meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4); margin-top: var(--sp-4); }
.gks-meta dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-meta dd { margin-top: var(--sp-1); font-size: var(--fs-body-sm); }
</style>

