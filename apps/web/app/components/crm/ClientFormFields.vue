<script setup lang="ts">
import type { EducationLevel, Gender, LeadSource, ServiceType, UniversityCard } from '@gks/shared';
import type { ClientForm } from '~/utils/client-form';
import { clientAge, defaultChoiceTrack, isMinorForm, reconcileChoices } from '~/utils/client-form';

/**
 * Every field a client record carries, grouped the way the office collects
 * them. Shared by the create and edit screens so the two stay identical (1B-14).
 */
/** Two-way bound: the parent owns the object, this component writes its fields. */
const form = defineModel<ClientForm>({ required: true });

const props = withDefaults(
  defineProps<{
    errors: Record<string, string>;
    universities: UniversityCard[];
    /** Disables the university select while the catalogue is still loading. */
    loadingUniversities?: boolean;
    /**
     * `self` is the client filling the same form from their own portal (1B-18):
     * the office's own fields — lead source and the internal note — are not
     * theirs to set, so they are left out rather than shown disabled.
     */
    variant?: 'staff' | 'self';
  }>(),
  { variant: 'staff' },
);

const GENDER_OPTIONS = [
  { value: '', label: 'Сонгоогүй' },
  ...(Object.entries(GENDER_LABELS) as [Gender, string][]).map(([value, label]) => ({ value, label })),
];
const EDUCATION_OPTIONS = [
  { value: '', label: 'Сонгоогүй' },
  ...(Object.entries(EDUCATION_LEVEL_LABELS) as [EducationLevel, string][]).map(([value, label]) => ({ value, label })),
];
const SERVICE_OPTIONS = [
  { value: '', label: 'Үйлчилгээ сонгоно уу' },
  ...(Object.entries(SERVICE_LABELS) as [ServiceType, string][]).map(([value, label]) => ({ value, label })),
];
const SOURCE_OPTIONS = (Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][])
  .map(([value, label]) => ({ value, label }));

const universityOptions = computed(() => toUniversityOptions(props.universities));

const age = computed(() => clientAge(form.value));
const isMinor = computed(() => isMinorForm(form.value));

/**
 * Switching service changes how many schools may be picked and on which track,
 * so the list is trimmed to the new rules rather than left for the API to
 * reject on save.
 */
watch(() => form.value.primaryServiceType, () => reconcileChoices(form.value));

/** The portal picks one school; it edits the first row of the same list. */
function setSingleUniversity(universityId: string): void {
  form.value.universityChoices = [{ universityId, track: defaultChoiceTrack(form.value.primaryServiceType) }];
}
</script>

<template>
  <DsCard title="Хувийн мэдээлэл" eyebrow="1">
    <div class="gks-grid">
      <DsInput v-model="form.lastName" label="Овог" required :error="errors.lastName" autocomplete="family-name" />
      <DsInput v-model="form.firstName" label="Нэр" required :error="errors.firstName" autocomplete="given-name" />
      <DsInput v-model="form.birthDate" label="Төрсөн он сар өдөр" type="date" required :error="errors.birthDate" />
      <DsInput
        v-model="form.registerNumber"
        label="Регистрийн дугаар"
        required
        placeholder="УБ12345678"
        hint="Гэрээнд бичигдэнэ"
        :error="errors.registerNumber"
      />
      <DsSelect v-model="form.gender" label="Хүйс" :options="GENDER_OPTIONS" />
      <DsInput v-model="form.phone" label="Утас" required placeholder="99112233" :error="errors.phone" />
      <DsInput v-model="form.phoneAlt" label="Нэмэлт утас" placeholder="88112233" :error="errors.phoneAlt" />
      <DsInput v-model="form.email" label="И-мэйл" type="email" hint="Байхгүй бол хоосон орхиж болно" />
      <DsInput v-model="form.address" label="Гэрийн хаяг" class="gks-grid__wide" />
    </div>
    <p v-if="age !== null" class="gks-client-form__age">
      Нас: <strong class="gks-tnum">{{ age }}</strong>
      <DsBadge v-if="isMinor" tone="warning" icon="triangle-alert">18 нас хүрээгүй</DsBadge>
    </p>
  </DsCard>

  <DsCard v-if="isMinor" title="Төлөөлөн гэрээ байгуулагч" eyebrow="2" accent>
    <p class="gks-client-form__note">
      18 нас хүрээгүй тул гэрээг асран хамгаалагч нь байгуулна. Овог, нэр, регистрийн дугаар заавал.
    </p>
    <div class="gks-grid">
      <DsInput v-model="form.guardianLastName" label="Овог" required :error="errors.guardianLastName" />
      <DsInput v-model="form.guardianFirstName" label="Нэр" required :error="errors.guardianFirstName" />
      <DsInput
        v-model="form.guardianRegisterNumber"
        label="Регистрийн дугаар"
        required
        placeholder="УБ87654321"
        :error="errors.guardianRegisterNumber"
      />
      <DsInput v-model="form.guardianPhone" label="Утас" placeholder="99112233" />
      <DsInput v-model="form.guardianRelation" label="Хамаарал" placeholder="Эх / Эцэг / Асран хамгаалагч" />
    </div>
  </DsCard>

  <DsCard title="Боловсрол ба хэлний түвшин" :eyebrow="isMinor ? '3' : '2'">
    <div class="gks-grid">
      <DsSelect v-model="form.educationLevel" label="Боловсролын түвшин" :options="EDUCATION_OPTIONS" />
      <DsInput v-model="form.schoolName" label="Төгссөн/суралцаж буй сургууль" />
      <DsInput v-model="form.gpa" label="Голч дүн" type="number" step="0.01" min="0" max="100" />
      <DsInput v-model="form.gpaScale" label="Голчийн шаталбар" placeholder="4.0 / 100" />
      <DsInput v-model="form.koreanLevel" label="Солонгос хэлний түвшин" placeholder="TOPIK 3" />
      <DsInput v-model="form.englishLevel" label="Англи хэлний түвшин" placeholder="IELTS 5.5" />
      <DsInput v-model="form.passportNumber" label="Гадаад паспортын дугаар" />
      <DsInput v-model="form.passportExpiry" label="Паспортын хүчинтэй хугацаа" type="date" />
    </div>
  </DsCard>

  <DsCard title="Үйлчилгээ ба зуучлал" :eyebrow="isMinor ? '4' : '3'">
    <div class="gks-grid">
      <DsSelect
        v-model="form.primaryServiceType"
        label="Сонгосон үйлчилгээ"
        :options="SERVICE_OPTIONS"
        :error="errors.primaryServiceType"
      />
      <DsCombobox
        v-if="variant === 'self'"
        :model-value="form.universityChoices[0]?.universityId ?? ''"
        label="Зорилтот сургууль"
        :options="universityOptions"
        :loading="loadingUniversities"
        @update:model-value="setSingleUniversity"
      />
      <DsInput v-model="form.targetMajor" label="Зорьж буй мэргэжил" />
      <DsSelect v-if="variant === 'staff'" v-model="form.source" label="Хаанаас ирсэн" :options="SOURCE_OPTIONS" />
    </div>

    <CrmUniversityChoices
      v-if="variant === 'staff'"
      v-model="form.universityChoices"
      :service-type="form.primaryServiceType"
      :universities="universities"
      :loading="loadingUniversities"
      :error="errors.universityChoices"
      class="gks-client-form__choices"
    />
    <DsTextarea
      v-if="variant === 'staff'"
      v-model="form.note"
      label="Тэмдэглэл"
      :rows="3"
      class="gks-client-form__note-field"
    />
    <slot name="service-extra" />
  </DsCard>
</template>

<style scoped>
.gks-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-grid__wide { grid-column: 1 / -1; }

.gks-client-form__age { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-client-form__note { margin-bottom: var(--sp-4); font-size: var(--fs-body-sm); color: var(--text-muted); }
.gks-client-form__note-field { margin-top: var(--sp-4); }
.gks-client-form__choices { margin-top: var(--sp-5); }

@media (max-width: 900px) {
  .gks-grid { grid-template-columns: 1fr; }
}
</style>
