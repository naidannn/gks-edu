<script setup lang="ts">
import type {
  DocStage,
  DocumentTemplate,
  EducationLevel,
  GuarantorRelation,
  GuarantorType,
  Necessity,
  RequirementRule,
  ServiceType,
  UniversityCard,
} from '@gks/shared';

/**
 * 1D-17/1D-18 — the rule base behind the checklist. A template says what a
 * document *is*; a rule says who needs it. Leaving a dimension empty means
 * "everyone", which is how the common rules stay short.
 */
definePageMeta({ middleware: 'admin', layout: 'admin' });

const api = useApi();

const templates = ref<DocumentTemplate[]>([]);
const rules = ref<RequirementRule[]>([]);
const universities = ref<UniversityCard[]>([]);
const selectedId = ref<string | null>(null);
const pending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const showNewTemplate = ref(false);

const blankTemplate = () => ({
  code: '',
  nameMn: '',
  descriptionMn: '',
  sourceHint: '',
  issuerHint: '',
  validityDays: '' as string | number,
  needsTranslation: false,
  needsNotary: false,
  needsApostille: false,
  needsPhysicalOriginal: false,
  tipsMn: '',
});
const draft = reactive(blankTemplate());

const blankRule = () => ({
  stage: 'ADMISSION' as DocStage,
  necessity: 'REQUIRED' as Necessity,
  serviceTypes: [] as ServiceType[],
  educationLevels: [] as EducationLevel[],
  guarantorTypes: [] as GuarantorType[],
  guarantorRelations: [] as GuarantorRelation[],
  universityId: '',
  conditionNote: '',
  sortOrder: 100,
});
const ruleDraft = reactive(blankRule());

async function load() {
  pending.value = true;
  error.value = null;
  try {
    const [templateList, ruleList, uniPage1, uniPage2] = await Promise.all([
      api.get<DocumentTemplate[]>('/document-templates?includeInactive=true'),
      api.get<RequirementRule[]>('/requirement-rules'),
      // A picker, not a recommendation — alphabetical is what staff scan for.
      api.get<{ items: UniversityCard[] }>('/universities', { query: { limit: 100, page: 1, sort: 'name' } }),
      api.get<{ items: UniversityCard[] }>('/universities', { query: { limit: 100, page: 2 } }),
    ]);
    templates.value = templateList;
    rules.value = ruleList;
    universities.value = [...uniPage1.items, ...uniPage2.items];
    selectedId.value ??= templateList[0]?.id ?? null;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);

const selected = computed(() => templates.value.find((t) => t.id === selectedId.value) ?? null);
const selectedRules = computed(() => rules.value.filter((rule) => rule.templateId === selectedId.value));

const STAGE_OPTIONS = (Object.entries(DOC_STAGE_LABELS) as [DocStage, string][]).map(([value, label]) => ({ value, label }));
const NECESSITY_OPTIONS = (Object.entries(NECESSITY_LABELS) as [Necessity, string][]).map(([value, label]) => ({ value, label }));
const SERVICE_OPTIONS = Object.entries(SERVICE_LABELS) as [ServiceType, string][];
const EDUCATION_OPTIONS = Object.entries(EDUCATION_LEVEL_LABELS) as [EducationLevel, string][];
const GUARANTOR_OPTIONS = Object.entries(GUARANTOR_TYPE_LABELS) as [GuarantorType, string][];
const RELATION_OPTIONS = Object.entries(GUARANTOR_RELATION_LABELS) as [GuarantorRelation, string][];
const UNIVERSITY_OPTIONS = computed(() => [
  { value: '', label: 'Бүх сургууль' },
  ...universities.value.map((u) => ({ value: u.id, label: u.nameMn })),
]);

function toggle<T>(list: T[], value: T) {
  const index = list.indexOf(value);
  if (index === -1) list.push(value);
  else list.splice(index, 1);
}

async function createTemplate() {
  saving.value = true;
  error.value = null;
  try {
    const created = await api.post<DocumentTemplate>('/document-templates', {
      ...draft,
      validityDays: draft.validityDays === '' ? undefined : Number(draft.validityDays),
      descriptionMn: draft.descriptionMn || undefined,
      sourceHint: draft.sourceHint || undefined,
      issuerHint: draft.issuerHint || undefined,
      tipsMn: draft.tipsMn || undefined,
    });
    Object.assign(draft, blankTemplate());
    showNewTemplate.value = false;
    await load();
    selectedId.value = created.id;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Хадгалж чадсангүй';
  } finally {
    saving.value = false;
  }
}

async function saveTemplate() {
  if (!selected.value) return;
  saving.value = true;
  try {
    const { id, code, nameMn, descriptionMn, sourceHint, issuerHint, validityDays, needsTranslation, needsNotary, needsApostille, needsPhysicalOriginal, tipsMn, isActive } = selected.value;
    await api.patch(`/document-templates/${id}`, {
      code, nameMn, descriptionMn, sourceHint, issuerHint, validityDays, needsTranslation, needsNotary, needsApostille, needsPhysicalOriginal, tipsMn, isActive,
    });
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Хадгалж чадсангүй';
  } finally {
    saving.value = false;
  }
}

async function addRule() {
  if (!selectedId.value) return;
  saving.value = true;
  error.value = null;
  try {
    await api.post('/requirement-rules', {
      templateId: selectedId.value,
      stage: ruleDraft.stage,
      necessity: ruleDraft.necessity,
      serviceTypes: ruleDraft.serviceTypes,
      educationLevels: ruleDraft.educationLevels,
      guarantorTypes: ruleDraft.guarantorTypes,
      guarantorRelations: ruleDraft.guarantorRelations,
      universityId: ruleDraft.universityId || undefined,
      conditionNote: ruleDraft.conditionNote || undefined,
      sortOrder: Number(ruleDraft.sortOrder),
    });
    Object.assign(ruleDraft, blankRule());
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Дүрэм нэмж чадсангүй';
  } finally {
    saving.value = false;
  }
}

async function removeRule(id: string) {
  await api.delete(`/requirement-rules/${id}`);
  await load();
}

/** Reads a rule back as the sentence it encodes. */
function describe(rule: RequirementRule): string {
  const parts: string[] = [];
  if (rule.serviceTypes.length) parts.push(rule.serviceTypes.map((s) => SERVICE_LABELS[s]).join(', '));
  if (rule.educationLevels.length) parts.push(rule.educationLevels.map((e) => EDUCATION_LEVEL_LABELS[e]).join(', '));
  if (rule.guarantorTypes.length) parts.push(rule.guarantorTypes.map((g) => GUARANTOR_TYPE_LABELS[g]).join(', '));
  if (rule.guarantorRelations.length) parts.push(rule.guarantorRelations.map((r) => GUARANTOR_RELATION_LABELS[r]).join(', '));
  if (rule.university) parts.push(rule.university.nameMn);
  return parts.length ? parts.join(' · ') : 'Бүх тохиолдолд';
}

useHead({ title: 'Материалын загвар · CRM' });
</script>

<template>
  <div class="gks-tpl">
    <header class="gks-tpl__head">
      <div>
        <span class="gks-eyebrow">Тохиргоо</span>
        <h1 class="gks-tpl__title">Материалын загвар ба дүрэм</h1>
        <p class="gks-tpl__count gks-tnum">{{ templates.length }} загвар · {{ rules.length }} дүрэм</p>
      </div>
      <DsButton variant="accent" icon-left="plus" @click="showNewTemplate = !showNewTemplate">Шинэ загвар</DsButton>
    </header>

    <p v-if="error" class="gks-tpl__error">{{ error }}</p>

    <DsCard v-if="showNewTemplate" title="Шинэ материалын загвар">
      <div class="gks-tpl__form">
        <DsInput v-model="draft.code" label="Код" placeholder="HS_TRANSCRIPT" required />
        <DsInput v-model="draft.nameMn" label="Нэр (монгол)" required />
        <DsInput v-model="draft.sourceHint" label="Хаанаас авах" placeholder="E-Mongolia-аас" />
        <DsInput v-model="draft.issuerHint" label="Баталгаажуулах байгууллага" />
        <DsInput v-model="draft.validityDays" label="Хүчинтэй хугацаа (хоног)" type="number" inputmode="numeric" />
      </div>
      <DsTextarea v-model="draft.descriptionMn" label="Тайлбар" :rows="2" />
      <DsTextarea v-model="draft.tipsMn" label="Бүрдүүлэх зөвлөмж" :rows="2" />
      <div class="gks-tpl__flags">
        <DsCheckbox v-model="draft.needsTranslation" label="Орчуулга шаардлагатай" />
        <DsCheckbox v-model="draft.needsNotary" label="Нотариат" />
        <DsCheckbox v-model="draft.needsApostille" label="Апостиль" />
        <DsCheckbox v-model="draft.needsPhysicalOriginal" label="Эх хувиар авчрах" />
      </div>
      <DsButton variant="accent" :loading="saving" :disabled="!draft.code || !draft.nameMn" @click="createTemplate">Үүсгэх</DsButton>
    </DsCard>

    <div class="gks-tpl__grid">
      <aside class="gks-tpl__list">
        <div v-if="pending" class="gks-tpl__skeleton"><div v-for="n in 8" :key="n" class="gks-tpl__skeleton-row" /></div>
        <button
          v-for="template in templates"
          :key="template.id"
          type="button"
          class="gks-tpl__item"
          :class="{ 'gks-tpl__item--active': template.id === selectedId, 'gks-tpl__item--off': !template.isActive }"
          @click="selectedId = template.id"
        >
          <span class="gks-tpl__item-name">{{ template.nameMn }}</span>
          <span class="gks-tpl__item-code gks-tnum">{{ template.code }} · {{ template._count?.rules ?? 0 }} дүрэм</span>
        </button>
      </aside>

      <section v-if="selected" class="gks-tpl__detail">
        <DsCard :title="selected.nameMn" :eyebrow="selected.code">
          <template #action>
            <DsButton size="sm" variant="secondary" :loading="saving" @click="saveTemplate">Хадгалах</DsButton>
          </template>

          <div class="gks-tpl__form">
            <DsInput v-model="selected.nameMn" label="Нэр" />
            <DsInput v-model="selected.sourceHint" label="Хаанаас авах" />
            <DsInput v-model="selected.issuerHint" label="Баталгаажуулах" />
            <DsInput v-model="selected.validityDays" label="Хүчинтэй (хоног)" type="number" inputmode="numeric" />
          </div>
          <DsTextarea v-model="selected.descriptionMn" label="Тайлбар" :rows="2" />
          <DsTextarea v-model="selected.tipsMn" label="Зөвлөмж" :rows="2" />
          <div class="gks-tpl__flags">
            <DsCheckbox v-model="selected.needsTranslation" label="Орчуулга" />
            <DsCheckbox v-model="selected.needsNotary" label="Нотариат" />
            <DsCheckbox v-model="selected.needsApostille" label="Апостиль" />
            <DsCheckbox v-model="selected.needsPhysicalOriginal" label="Эх хувиар авчрах" />
            <DsCheckbox v-model="selected.isActive" label="Идэвхтэй" />
          </div>
        </DsCard>

        <DsCard title="Дүрмүүд" eyebrow="Хэн энэ материалыг бүрдүүлэх вэ">
          <ul v-if="selectedRules.length" class="gks-tpl__rules">
            <li v-for="rule in selectedRules" :key="rule.id" class="gks-tpl__rule" :class="{ 'gks-tpl__rule--off': !rule.isActive }">
              <div>
                <p class="gks-tpl__rule-head">
                  <DsBadge tone="neutral">{{ DOC_STAGE_LABELS[rule.stage] }}</DsBadge>
                  <DsBadge :tone="rule.necessity === 'REQUIRED' ? 'info' : 'neutral'">{{ NECESSITY_LABELS[rule.necessity] }}</DsBadge>
                </p>
                <p class="gks-tpl__rule-desc">{{ describe(rule) }}</p>
                <p v-if="rule.conditionNote" class="gks-tpl__rule-note">{{ rule.conditionNote }}</p>
              </div>
              <DsIconButton v-if="rule.isActive" icon="trash-2" label="Дүрэм хасах" @click="removeRule(rule.id)" />
            </li>
          </ul>
          <p v-else class="gks-tpl__empty">Энэ загварт дүрэм алга — өөрөөр хэлбэл хэнд ч харагдахгүй.</p>

          <div class="gks-tpl__new-rule">
            <h3 class="gks-tpl__new-rule-title">Дүрэм нэмэх</h3>
            <div class="gks-tpl__form">
              <DsSelect v-model="ruleDraft.stage" label="Шат" :options="STAGE_OPTIONS" />
              <DsSelect v-model="ruleDraft.necessity" label="Шаардлага" :options="NECESSITY_OPTIONS" />
              <DsSelect v-model="ruleDraft.universityId" label="Сургууль" :options="UNIVERSITY_OPTIONS" hint="Тухайн сургуулийн нэмэлт шаардлага" />
              <DsInput v-model="ruleDraft.sortOrder" label="Эрэмбэ" type="number" inputmode="numeric" />
            </div>

            <div class="gks-tpl__dims">
              <div>
                <p class="gks-tpl__dim-label">Үйлчилгээ <span>хоосон = бүгд</span></p>
                <div class="gks-tpl__chips">
                  <DsTag v-for="[value, label] in SERVICE_OPTIONS" :key="value" clickable :selected="ruleDraft.serviceTypes.includes(value)" @click="toggle(ruleDraft.serviceTypes, value)">{{ label }}</DsTag>
                </div>
              </div>
              <div>
                <p class="gks-tpl__dim-label">Боловсролын түвшин <span>хоосон = бүгд</span></p>
                <div class="gks-tpl__chips">
                  <DsTag v-for="[value, label] in EDUCATION_OPTIONS" :key="value" clickable :selected="ruleDraft.educationLevels.includes(value)" @click="toggle(ruleDraft.educationLevels, value)">{{ label }}</DsTag>
                </div>
              </div>
              <div>
                <p class="gks-tpl__dim-label">Батлан даагч <span>хоосон = бүгд</span></p>
                <div class="gks-tpl__chips">
                  <DsTag v-for="[value, label] in GUARANTOR_OPTIONS" :key="value" clickable :selected="ruleDraft.guarantorTypes.includes(value)" @click="toggle(ruleDraft.guarantorTypes, value)">{{ label }}</DsTag>
                </div>
              </div>
              <div>
                <p class="gks-tpl__dim-label">Батлан даагчийн хамаарал <span>хоосон = бүгд</span></p>
                <div class="gks-tpl__chips">
                  <DsTag v-for="[value, label] in RELATION_OPTIONS" :key="value" clickable :selected="ruleDraft.guarantorRelations.includes(value)" @click="toggle(ruleDraft.guarantorRelations, value)">{{ label }}</DsTag>
                </div>
              </div>
            </div>

            <DsInput v-model="ruleDraft.conditionNote" label="Нөхцөлийн тэмдэглэл" placeholder="байгаа тохиолдолд" />
            <DsButton variant="accent" :loading="saving" @click="addRule">Дүрэм нэмэх</DsButton>
          </div>
        </DsCard>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gks-tpl { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-tpl__head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--sp-4); flex-wrap: wrap; }
.gks-tpl__title { margin-top: var(--sp-2); font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-tpl__count { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-tpl__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }

.gks-tpl__grid { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: var(--sp-4); align-items: start; }
.gks-tpl__list { display: flex; flex-direction: column; gap: var(--sp-1); max-height: 70vh; overflow-y: auto; }
.gks-tpl__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: var(--sp-3);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-2);
  background: var(--surface-card);
  cursor: pointer;
}
.gks-tpl__item:hover { background: var(--surface-hover); }
.gks-tpl__item--active { border-color: var(--brand-600); background: var(--surface-selected); }
.gks-tpl__item--off { opacity: .55; }
.gks-tpl__item-name { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-tpl__item-code { font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-tpl__detail { display: flex; flex-direction: column; gap: var(--sp-4); }
.gks-tpl__form { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-3); margin-bottom: var(--sp-3); }
.gks-tpl__flags { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin-top: var(--sp-3); }

.gks-tpl__rules { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-tpl__rule { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-3); border: var(--border-hair) solid var(--line-hairline); border-radius: var(--radius-2); }
.gks-tpl__rule--off { opacity: .5; }
.gks-tpl__rule-head { display: flex; gap: var(--sp-2); }
.gks-tpl__rule-desc { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-tpl__rule-note { margin-top: 2px; font-size: var(--fs-caption); color: var(--text-subtle); font-style: italic; }
.gks-tpl__empty { color: var(--text-subtle); font-style: italic; }

.gks-tpl__new-rule { margin-top: var(--sp-5); padding-top: var(--sp-5); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-tpl__new-rule-title { font-size: var(--fs-label); font-weight: var(--fw-semibold); margin-bottom: var(--sp-3); }
.gks-tpl__dims { display: flex; flex-direction: column; gap: var(--sp-4); margin-bottom: var(--sp-4); }
.gks-tpl__dim-label { font-size: var(--fs-caption); font-weight: var(--fw-medium); color: var(--text-muted); margin-bottom: var(--sp-2); }
.gks-tpl__dim-label span { font-weight: var(--fw-regular); color: var(--text-subtle); font-size: var(--fs-micro); }
.gks-tpl__chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); }

.gks-tpl__skeleton { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-tpl__skeleton-row { height: 52px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }

@media (max-width: 1100px) {
  .gks-tpl__grid { grid-template-columns: 1fr; }
  .gks-tpl__list { max-height: none; }
}
</style>
