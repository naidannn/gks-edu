<script setup lang="ts">
import type { CreateCaseDocumentInput, DocStage, DocumentTemplate, Necessity } from '@gks/shared';

/**
 * Adding one material to one client's checklist (1D-22).
 *
 * Two ways in, because staff arrive with two different things in hand: a
 * material the register already knows, or a school's demand nobody has written
 * down yet. The second one is not a one-off — it is saved as a template, so the
 * next client who needs the same paper is a pick from the first tab.
 */
const props = defineProps<{ stage: DocStage; busy?: boolean }>();
const emit = defineEmits<{ submit: [payload: CreateCaseDocumentInput]; cancel: [] }>();

const api = useApi();

const mode = ref<'pick' | 'write'>('pick');
const templates = ref<DocumentTemplate[]>([]);
const loading = ref(true);

const templateId = ref('');
const draft = reactive({
  nameMn: '',
  descriptionMn: '',
  sourceHint: '',
  issuerHint: '',
  needsTranslation: false,
  needsNotary: false,
  needsApostille: false,
  needsPhysicalOriginal: false,
});
const shared = reactive({ necessity: 'REQUIRED' as Necessity, conditionNote: '', dueAt: '' });

const loadError = ref<string | null>(null);

onMounted(async () => {
  loadError.value = null;
  try {
    templates.value = await api.get<DocumentTemplate[]>('/document-templates');
  } catch (e) {
    // An empty picker and a failed request look the same; only one of them
    // means "there is no template for this".
    loadError.value = apiErrorMessage(e, 'Загваруудыг ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }
});

const NECESSITY_OPTIONS = selectOptions(NECESSITY_LABELS);

/** Alphabetical: the picker is scanned by name, never by code. */
const TEMPLATE_OPTIONS = computed(() =>
  [...templates.value]
    .sort((a, b) => a.nameMn.localeCompare(b.nameMn, 'mn'))
    .map((template) => ({
      value: template.id,
      label: template.nameMn,
      sub: [template.code, ...templateFlags(template)].join(' · '),
      keywords: template.descriptionMn ?? '',
    })),
);

function templateFlags(template: DocumentTemplate): string[] {
  const flags: string[] = [];
  if (template.needsPhysicalOriginal) flags.push('эх хувиар');
  if (template.needsTranslation) flags.push('орчуулга');
  if (template.needsNotary) flags.push('нотариат');
  if (template.needsApostille) flags.push('апостиль');
  return flags;
}

const selected = computed(() => templates.value.find((template) => template.id === templateId.value) ?? null);
const ready = computed(() => (mode.value === 'pick' ? Boolean(templateId.value) : draft.nameMn.trim().length > 1));

function submit() {
  if (!ready.value) return;

  emit('submit', {
    stage: props.stage,
    necessity: shared.necessity,
    conditionNote: shared.conditionNote.trim() || undefined,
    // A date input gives the day; the deadline is the end of it.
    dueAt: shared.dueAt ? new Date(`${shared.dueAt}T23:59:59`).toISOString() : undefined,
    ...(mode.value === 'pick'
      ? { templateId: templateId.value }
      : {
          template: {
            nameMn: draft.nameMn.trim(),
            descriptionMn: draft.descriptionMn.trim() || undefined,
            sourceHint: draft.sourceHint.trim() || undefined,
            issuerHint: draft.issuerHint.trim() || undefined,
            needsTranslation: draft.needsTranslation,
            needsNotary: draft.needsNotary,
            needsApostille: draft.needsApostille,
            needsPhysicalOriginal: draft.needsPhysicalOriginal,
          },
        }),
  });
}
</script>

<template>
  <DsCard title="Материал нэмэх" :eyebrow="DOC_STAGE_LABELS[stage]">
    <div class="gks-adddoc__modes">
      <DsTag clickable :selected="mode === 'pick'" @click="mode = 'pick'">Загвараас сонгох</DsTag>
      <DsTag clickable :selected="mode === 'write'" @click="mode = 'write'">Шинэ материал бичих</DsTag>
    </div>

    <template v-if="mode === 'pick'">
      <DsCombobox
        v-model="templateId"
        label="Материал"
        :options="TEMPLATE_OPTIONS"
        :loading="loading"
        placeholder="Нэрээр хайх…"
        hint="Өмнө нь бүртгэсэн бүх материалын загвар"
      />
      <p v-if="loadError" class="gks-adddoc__error">{{ loadError }}</p>
      <p v-else-if="selected?.descriptionMn" class="gks-adddoc__desc">{{ selected.descriptionMn }}</p>
    </template>

    <template v-else>
      <div class="gks-form-grid">
        <DsInput v-model="draft.nameMn" label="Материалын нэр" placeholder="Банкны тодорхойлолт" required />
        <DsInput v-model="draft.sourceHint" label="Хаанаас авах" placeholder="Банкнаас" />
        <DsInput v-model="draft.issuerHint" label="Баталгаажуулах байгууллага" />
      </div>
      <DsTextarea
        v-model="draft.descriptionMn"
        label="Тайлбар"
        :rows="2"
        placeholder="Ямар шаардлага тавигдаж байгааг бичнэ — хэрэглэгчид ийм байдлаар харагдана."
      />
      <div class="gks-adddoc__flags">
        <DsCheckbox v-model="draft.needsPhysicalOriginal" label="Эх хувиар авчрах" />
        <DsCheckbox v-model="draft.needsTranslation" label="Орчуулга" />
        <DsCheckbox v-model="draft.needsNotary" label="Нотариат" />
        <DsCheckbox v-model="draft.needsApostille" label="Апостиль" />
      </div>
      <p class="gks-adddoc__note">
        Энэ материал загвар болж хадгалагдана — дараагийн үйлчлүүлэгчид дахин бичихгүйгээр
        «Загвараас сонгох» хэсгээс нэмнэ. Дүрэм холбогдоогүй тул хэн нэгэнд өөрөө үүсэхгүй.
      </p>
    </template>

    <div class="gks-form-grid gks-adddoc__common">
      <DsSelect v-model="shared.necessity" label="Шаардлага" :options="NECESSITY_OPTIONS" />
      <DsInput v-model="shared.dueAt" label="Эцсийн хугацаа" type="date" hint="Хоосон бол сануулга үүсэхгүй" />
      <DsInput
        v-model="shared.conditionNote"
        label="Тэмдэглэл"
        placeholder="Зөвхөн энэ үйлчлүүлэгчид хамаарах тайлбар"
      />
    </div>

    <div class="gks-form-actions gks-adddoc__actions">
      <DsButton variant="accent" icon-left="plus" :loading="busy" :disabled="!ready" @click="submit">
        Жагсаалтад нэмэх
      </DsButton>
      <DsButton variant="ghost" @click="emit('cancel')">Болих</DsButton>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-adddoc__modes { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-4); }
.gks-adddoc__desc { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-adddoc__error { color: var(--danger-fg); font-size: var(--fs-body-sm); margin-top: var(--sp-2); }
.gks-adddoc__flags { display: flex; flex-wrap: wrap; gap: var(--sp-4); margin-top: var(--sp-3); }
.gks-adddoc__note { margin-top: var(--sp-3); font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-adddoc__common { margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: var(--border-hair) solid var(--line-hairline); }
.gks-adddoc__actions { margin-top: var(--sp-4); }
</style>
