<script setup lang="ts">
import type { CaseConditions, EducationLevel, GuarantorRelation, GuarantorType } from '@gks/shared';

/**
 * 1D-06 — the three answers the rule engine needs. Saving re-resolves the
 * checklist, so the form states plainly that the list will change.
 */
const props = defineProps<{ conditions: CaseConditions | null; saving?: boolean }>();
const emit = defineEmits<{ save: [payload: Partial<CaseConditions>] }>();

const form = reactive({
  educationLevel: props.conditions?.educationLevel ?? ('' as EducationLevel | ''),
  guarantorType: props.conditions?.guarantorType ?? ('NONE' as GuarantorType),
  guarantorRelation: props.conditions?.guarantorRelation ?? ('' as GuarantorRelation | ''),
  guarantorName: props.conditions?.guarantorName ?? '',
  guarantorPhone: props.conditions?.guarantorPhone ?? '',
});

watch(
  () => props.conditions,
  (next) => {
    if (!next) return;
    form.educationLevel = next.educationLevel ?? '';
    form.guarantorType = next.guarantorType;
    form.guarantorRelation = next.guarantorRelation ?? '';
    form.guarantorName = next.guarantorName ?? '';
    form.guarantorPhone = next.guarantorPhone ?? '';
  },
);

const EDUCATION_OPTIONS = [
  { value: '', label: 'Сонгоно уу' },
  ...Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];
const GUARANTOR_OPTIONS = Object.entries(GUARANTOR_TYPE_LABELS).map(([value, label]) => ({ value, label }));
const RELATION_OPTIONS = [
  { value: '', label: 'Сонгоно уу' },
  ...Object.entries(GUARANTOR_RELATION_LABELS).map(([value, label]) => ({ value, label })),
];

const hasGuarantor = computed(() => form.guarantorType !== 'NONE');
/** Anything but a parent adds the kinship reference to the list. */
const addsKinship = computed(() => hasGuarantor.value && form.guarantorRelation !== '' && form.guarantorRelation !== 'PARENT');

function save() {
  emit('save', {
    educationLevel: (form.educationLevel || null) as EducationLevel | null,
    guarantorType: form.guarantorType,
    guarantorRelation: (form.guarantorRelation || null) as GuarantorRelation | null,
    guarantorName: form.guarantorName || null,
    guarantorPhone: form.guarantorPhone || null,
  });
}
</script>

<template>
  <DsCard title="Таны нөхцөл" eyebrow="Материалын жагсаалт эндээс тодорхойлогдоно">
    <div class="gks-cond">
      <DsSelect
        v-model="form.educationLevel"
        label="Боловсролын түвшин"
        :options="EDUCATION_OPTIONS"
        hint="ЕБС төгссөн эсэх нь шаардагдах дүнгийн бичгийг шийднэ"
      />
      <DsSelect v-model="form.guarantorType" label="Батлан даагчийн ажил эрхлэлт" :options="GUARANTOR_OPTIONS" />
      <template v-if="hasGuarantor">
        <DsSelect v-model="form.guarantorRelation" label="Батлан даагч тань хэн бэ?" :options="RELATION_OPTIONS" />
        <DsInput v-model="form.guarantorName" label="Батлан даагчийн нэр" />
        <DsInput v-model="form.guarantorPhone" label="Утас" inputmode="tel" />
      </template>
    </div>

    <p v-if="addsKinship" class="gks-cond__hint">
      <DsIcon name="info" :size="14" />
      Эцэг эхээс бусад хүн батлан даагчаар орох тул <strong>төрөл садангийн лавлагаа</strong> нэмэгдэнэ.
    </p>

    <template #action>
      <DsButton size="sm" variant="accent" :loading="saving" @click="save">Хадгалах</DsButton>
    </template>
  </DsCard>
</template>

<style scoped>
.gks-cond { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4); }
.gks-cond__hint {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
  font-size: var(--fs-body-sm);
  color: var(--info-fg);
  background: var(--info-bg);
  border: var(--border-hair) solid var(--info-line);
  border-radius: var(--radius-2);
  padding: var(--sp-3);
}
</style>
