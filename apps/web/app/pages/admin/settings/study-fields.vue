<script setup lang="ts">
import type {
  AdminProgram,
  AssignStudyFieldResult,
  PaginatedResult,
  RematchResult,
  StudyField,
} from '@gks/shared';

/**
 * The canonical subject list, and the loop that keeps it useful.
 *
 * Every school words the same subject differently — 경영학과 마케팅전공,
 * Department of Marketing, "Маркетинг менежмент". A programme keeps the
 * school's wording and is *filed* under one of these, which is the only reason
 * "маркетинг" can be one question instead of 135.
 *
 * The screen has three parts, in the order the work actually happens:
 *   1. the taxonomy, where a subject's aliases are edited — adding one is how
 *      the matcher learns a new school's naming;
 *   2. the unclassified programmes, which are filed by hand and can teach their
 *      wording to the subject at the same time;
 *   3. the rematch, which re-runs the matcher over the catalogue afterwards and
 *      shows what it would change before it changes anything.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Судлах чиглэл · Админ' });

const api = useApi();
const studyFields = useStudyFields({ admin: true });

const errorMsg = ref<string | null>(null);
const savingId = ref<string | null>(null);

/* ── 1. The taxonomy ─────────────────────────────────────────────────────── */

const editingId = ref<string | null>(null);
const draft = reactive({ nameMn: '', nameEn: '', nameKo: '', aliases: '', isActive: true });

function startEdit(field: StudyField) {
  editingId.value = field.id;
  draft.nameMn = field.nameMn;
  draft.nameEn = field.nameEn;
  draft.nameKo = field.nameKo ?? '';
  // One per line: an alias can contain a comma, and a Korean department name
  // routinely does.
  draft.aliases = field.aliases.join('\n');
  draft.isActive = field.isActive;
}

async function saveField() {
  if (!editingId.value) return;
  savingId.value = editingId.value;
  errorMsg.value = null;
  try {
    await api.patch(`/admin/study-fields/${editingId.value}`, {
      nameMn: draft.nameMn.trim(),
      nameEn: draft.nameEn.trim(),
      nameKo: draft.nameKo.trim() || null,
      aliases: draft.aliases.split('\n').map((line) => line.trim()).filter(Boolean),
      isActive: draft.isActive,
    });
    editingId.value = null;
    await studyFields.load();
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Хадгалж чадсангүй');
  } finally {
    savingId.value = null;
  }
}

/* ── 2. The unclassified programmes ──────────────────────────────────────── */

const unclassified = ref<AdminProgram[]>([]);
const unclassifiedTotal = ref(0);
const loadingUnclassified = ref(false);
const selected = ref<Set<string>>(new Set());
const assignTo = ref('');
const learnAliases = ref(true);
const assigning = ref(false);
const assignResult = ref<AssignStudyFieldResult | null>(null);

const assignOptions = computed(() => studyFieldOptions(studyFields.groups.value, 'Чиглэл сонгоно уу'));

async function loadUnclassified() {
  loadingUnclassified.value = true;
  try {
    const result = await api.get<PaginatedResult<AdminProgram>>('/admin/programs', {
      query: { unclassified: true, limit: 100, sort: 'university' },
    });
    unclassified.value = result.items;
    unclassifiedTotal.value = result.meta.total;
  } catch {
    unclassified.value = [];
  } finally {
    loadingUnclassified.value = false;
  }
}

function toggleSelected(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

async function assign() {
  if (!assignTo.value || !selected.value.size) return;
  assigning.value = true;
  errorMsg.value = null;
  try {
    assignResult.value = await api.post<AssignStudyFieldResult>(
      `/admin/study-fields/${assignTo.value}/assign`,
      { programIds: [...selected.value], learnAliases: learnAliases.value },
    );
    selected.value = new Set();
    await Promise.all([loadUnclassified(), studyFields.load()]);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Ангилж чадсангүй');
  } finally {
    assigning.value = false;
  }
}

/* ── 3. The rematch ──────────────────────────────────────────────────────── */

const rematch = ref<RematchResult | null>(null);
const rematching = ref(false);

async function runRematch(dryRun: boolean) {
  rematching.value = true;
  errorMsg.value = null;
  try {
    rematch.value = await api.post<RematchResult>('/admin/study-fields/rematch', { dryRun });
    if (!dryRun) await Promise.all([loadUnclassified(), studyFields.load()]);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Дахин ангилж чадсангүй');
  } finally {
    rematching.value = false;
  }
}

onMounted(() => {
  studyFields.load();
  loadUnclassified();
});
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Тохиргоо</span>
        <h1 class="gks-page__title">Судлах чиглэл</h1>
        <p class="gks-page__hint">
          Сургууль бүр нэг л мэргэжлийг өөр өөрөөр нэрлэдэг. Хөтөлбөр сургуулийн нэршлээ хадгалж
          үлдэн, эндхийн нэг чиглэлд хамаарна — тэгснээр "маркетинг" гэж хайхад бүх сургуулийн
          маркетинг нэг дор гарч ирнэ.
        </p>
      </div>
      <DsButton variant="ghost" icon-left="list" @click="navigateTo('/admin/programs')">
        Хөтөлбөрийн жагсаалт
      </DsButton>
    </header>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <!-- ─── Unclassified ─────────────────────────────────────────────────── -->
    <DsCard :title="`Ангилаагүй хөтөлбөр (${unclassifiedTotal})`">
      <p class="gks-sf__note">
        Эдгээрийг чиглэлээр хайхад олдохгүй. Сонгоод чиглэлд нь хамааруулна уу —
        "нэршлийг нь сурга" гэснийг тэмдэглэвэл дараагийн сургууль ижилхэн нэрлэсэн тохиолдолд
        систем өөрөө таних болно.
      </p>

      <div v-if="loadingUnclassified" class="gks-sf__note">Ачаалж байна…</div>
      <p v-else-if="!unclassified.length" class="gks-sf__ok">
        <DsIcon name="check" :size="15" /> Бүх хөтөлбөр ангилагдсан байна.
      </p>

      <template v-else>
        <ul class="gks-sf__unclassified">
          <li v-for="program in unclassified" :key="program.id">
            <label>
              <DsCheckbox
                :model-value="selected.has(program.id)"
                @update:model-value="toggleSelected(program.id)"
              />
              <span>
                <strong>{{ program.nameMn }}</strong>
                <small>
                  {{ program.university.nameMn }} · {{ PROGRAM_LEVEL_LABELS[program.level] }}
                  <template v-if="program.nameKo"> · {{ program.nameKo }}</template>
                </small>
              </span>
            </label>
          </li>
        </ul>

        <div class="gks-sf__assign">
          <DsSelect v-model="assignTo" :options="assignOptions" aria-label="Чиглэл" />
          <label class="gks-sf__learn">
            <DsCheckbox v-model="learnAliases" />
            <span>Нэршлийг нь сурга</span>
          </label>
          <DsButton
            variant="accent"
            icon-left="check"
            :loading="assigning"
            :disabled="!assignTo || !selected.size"
            @click="assign"
          >
            Сонгосон {{ selected.size }}-г хамааруулах
          </DsButton>
        </div>

        <p v-if="assignResult" class="gks-sf__ok">
          <DsIcon name="check" :size="15" />
          {{ assignResult.assigned }} хөтөлбөр ангилагдлаа<span v-if="assignResult.learnedAliases.length">;
          шинээр сурсан нэршил: {{ assignResult.learnedAliases.join(', ') }}</span>.
        </p>
      </template>
    </DsCard>

    <!-- ─── Rematch ──────────────────────────────────────────────────────── -->
    <DsCard title="Дахин ангилах">
      <p class="gks-sf__note">
        Нэршил нэмсний дараа энэ товчийг дарвал бүх ангилаагүй хөтөлбөрийг дахин шалгана.
        Эхлээд <strong>урьдчилан харах</strong>: юу өөрчлөгдөхийг харуулна, юу ч бичихгүй.
      </p>
      <div class="gks-sf__rematch">
        <DsButton variant="secondary" icon-left="eye" :loading="rematching" @click="runRematch(true)">
          Урьдчилан харах
        </DsButton>
        <DsButton
          variant="accent"
          icon-left="check"
          :loading="rematching"
          :disabled="!rematch || rematch.matched === 0"
          @click="runRematch(false)"
        >
          Бичих
        </DsButton>
      </div>

      <template v-if="rematch">
        <p class="gks-sf__note">
          {{ rematch.scanned }} хөтөлбөр шалгалаа — {{ rematch.matched }} нь таарлаа,
          {{ rematch.unmatched }} нь таараагүй.
          <strong v-if="rematch.dryRun">(Урьдчилан харах — хадгалаагүй.)</strong>
          <strong v-else>Бичигдлээ.</strong>
        </p>
        <ul v-if="rematch.rows.length" class="gks-sf__rematch-rows">
          <li v-for="row in rematch.rows" :key="row.programId">
            <span>{{ row.universityNameMn }} · <strong>{{ row.programName }}</strong></span>
            <DsIcon name="arrow-right" :size="14" />
            <span>{{ row.fieldSlug }}</span>
            <small>"{{ row.matchedOn }}"-оор таарлаа</small>
          </li>
        </ul>
      </template>
    </DsCard>

    <!-- ─── The taxonomy ─────────────────────────────────────────────────── -->
    <DsCard title="Чиглэлийн жагсаалт">
      <div v-if="studyFields.loading.value" class="gks-sf__note">Ачаалж байна…</div>

      <div v-for="group in studyFields.groups.value" v-else :key="group.id" class="gks-sf__group">
        <h3>
          {{ group.nameMn }}
          <small>{{ group.nameKo ?? group.nameEn }}</small>
          <span class="gks-tnum">{{ group.programCount }}</span>
        </h3>

        <ul class="gks-sf__fields">
          <li v-for="child in group.children" :key="child.id" :class="{ 'is-off': !child.isActive }">
            <template v-if="editingId === child.id">
              <div class="gks-form-grid">
                <DsInput v-model="draft.nameMn" label="Монгол нэр" />
                <DsInput v-model="draft.nameEn" label="Англи нэр" />
                <DsInput v-model="draft.nameKo" label="Солонгос нэр" />
              </div>
              <DsTextarea
                v-model="draft.aliases"
                label="Өөр нэршил (мөр бүрт нэг)"
                :rows="5"
                placeholder="마케팅&#10;Marketing&#10;Маркетинг менежмент"
              />
              <label class="gks-sf__learn">
                <DsCheckbox v-model="draft.isActive" />
                <span>Идэвхтэй</span>
              </label>
              <footer class="gks-sf__edit-foot">
                <DsButton variant="ghost" size="sm" @click="editingId = null">Болих</DsButton>
                <DsButton
                  variant="accent"
                  size="sm"
                  icon-left="check"
                  :loading="savingId === child.id"
                  @click="saveField"
                >
                  Хадгалах
                </DsButton>
              </footer>
            </template>

            <template v-else>
              <div class="gks-sf__field-head">
                <span>
                  <strong>{{ child.nameMn }}</strong>
                  <small>{{ child.nameKo ?? child.nameEn }} · <code>{{ child.slug }}</code></small>
                </span>
                <span class="gks-sf__field-actions">
                  <NuxtLink :to="`/admin/programs?field=${child.slug}`" class="gks-tnum">
                    {{ child.programCount }} хөтөлбөр
                  </NuxtLink>
                  <DsButton variant="ghost" size="sm" icon-left="pencil" @click="startEdit(child)">Засах</DsButton>
                </span>
              </div>
              <p v-if="child.aliases.length" class="gks-sf__aliases">
                {{ child.aliases.join(' · ') }}
              </p>
            </template>
          </li>
        </ul>
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-sf__note { color: var(--text-subtle); font-size: var(--fs-body-sm); line-height: 1.6; }
.gks-sf__note strong { color: var(--text-body); }
.gks-sf__ok { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-3); color: var(--green-700); font-size: var(--fs-body-sm); }
.gks-sf__unclassified { display: grid; gap: var(--sp-2); margin-top: var(--sp-4); max-height: 420px; overflow-y: auto; list-style: none; }
.gks-sf__unclassified label { display: flex; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-2); border-radius: var(--radius-1); cursor: pointer; }
.gks-sf__unclassified label:hover { background: var(--surface-sunken); }
.gks-sf__unclassified small { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-sf__assign { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4); padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }
.gks-sf__learn { display: inline-flex; align-items: center; gap: var(--sp-2); color: var(--text-muted); font-size: var(--fs-body-sm); cursor: pointer; }
.gks-sf__rematch { display: flex; gap: var(--sp-2); margin-block: var(--sp-4); }
.gks-sf__rematch-rows { display: grid; gap: var(--sp-1); margin-top: var(--sp-3); max-height: 320px; overflow-y: auto; list-style: none; font-size: var(--fs-caption); }
.gks-sf__rematch-rows li { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); padding: var(--sp-2); border-bottom: 1px solid var(--line-soft); }
.gks-sf__rematch-rows small { color: var(--text-subtle); }
.gks-sf__group { margin-top: var(--sp-5); }
.gks-sf__group h3 { display: flex; align-items: baseline; gap: var(--sp-2); font-size: var(--fs-label); font-weight: var(--fw-semibold); }
.gks-sf__group h3 small { color: var(--text-subtle); font-weight: var(--fw-regular); }
.gks-sf__group h3 span { margin-left: auto; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-sf__fields { display: grid; gap: var(--sp-2); margin-top: var(--sp-2); list-style: none; }
.gks-sf__fields li { padding: var(--sp-3); border: 1px solid var(--line-soft); border-radius: var(--radius-2); }
.gks-sf__fields li.is-off { opacity: 0.55; }
.gks-sf__field-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-sf__field-head small { display: block; margin-top: 2px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-sf__field-actions { display: inline-flex; align-items: center; gap: var(--sp-3); }
.gks-sf__field-actions a { color: var(--brand-700); font-size: var(--fs-caption); }
.gks-sf__aliases { margin-top: var(--sp-2); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-sf__edit-foot { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-3); }
</style>
