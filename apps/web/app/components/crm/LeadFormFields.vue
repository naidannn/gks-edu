<script setup lang="ts">
import type { ServiceType, UniversityCard } from '@gks/shared';
import { INITIAL_LEAD_STAGES } from '@gks/shared';
import type { LeadForm } from '~/utils/lead-form';

/**
 * Everything the office asks a person during a consultation (1B-19), grouped in
 * the order the conversation actually goes: who they are, what they have
 * studied, what they want, and who is following it up.
 *
 * Shared by the registration screen and the detail page's edit mode so the two
 * never drift apart on what "бүрэн бүртгэл" means.
 */
const form = defineModel<LeadForm>({ required: true });

const props = withDefaults(
  defineProps<{
    errors: Record<string, string>;
    universities: UniversityCard[];
    loadingUniversities?: boolean;
    staff?: { id: string; name: string | null; email: string | null }[];
    /**
     * `edit` drops the fields that have their own endpoint — stage moves through
     * the funnel (1B-02), assignment through its own log (1B-04) — so the edit
     * form cannot quietly bypass either.
     */
    variant?: 'create' | 'edit';
  }>(),
  { variant: 'create', staff: () => [] },
);

const EDUCATION_OPTIONS = selectOptions(EDUCATION_LEVEL_LABELS, 'Сонгоогүй');
const SOURCE_OPTIONS = selectOptions(LEAD_SOURCE_LABELS);
const STAGE_OPTIONS = INITIAL_LEAD_STAGES.map((stage) => ({ value: stage, label: LEAD_STAGE_LABELS[stage] }));
const SERVICE_ENTRIES = Object.entries(SERVICE_LABELS) as [ServiceType, string][];

const staffOptions = computed(() => [
  { value: '', label: 'Хариуцагчгүй' },
  ...props.staff.map((member) => ({ value: member.id, label: member.name ?? member.email ?? 'Ажилтан' })),
]);

/**
 * A picker that only offers what is not already on the list. The empty row
 * `toUniversityOptions` leads with is dropped too: here the combobox adds a
 * school rather than holding one, so "not chosen" is not a choice.
 */
const universityOptions = computed(() =>
  toUniversityOptions(props.universities).filter(
    (option) => option.value && !form.value.interestedUniversityIds.includes(option.value),
  ),
);

const pickedUniversities = computed(() =>
  form.value.interestedUniversityIds.map((id) => {
    const university = props.universities.find((row) => row.id === id);
    return { id, label: university ? universityName(university) : '…' };
  }),
);

/**
 * The combobox is a picker, not a value — it stays empty and each choice lands
 * in the list below, so several schools can go in one after another.
 */
function addUniversity(id: string): void {
  if (id && !form.value.interestedUniversityIds.includes(id)) {
    form.value.interestedUniversityIds = [...form.value.interestedUniversityIds, id];
  }
}
function removeUniversity(id: string): void {
  form.value.interestedUniversityIds = form.value.interestedUniversityIds.filter((item) => item !== id);
}

function toggleService(service: ServiceType, selected: boolean): void {
  form.value.interestedServices = selected
    ? [...form.value.interestedServices, service]
    : form.value.interestedServices.filter((item) => item !== service);
}
</script>

<template>
  <DsCard title="Холбоо барих" eyebrow="1">
    <div class="gks-grid">
      <DsInput v-model="form.lastName" label="Овог" required :error="errors.lastName" autocomplete="family-name" />
      <DsInput v-model="form.firstName" label="Нэр" required :error="errors.firstName" autocomplete="given-name" />
      <DsInput
        v-model="form.phone"
        label="Утас"
        required
        placeholder="99112233"
        :error="errors.phone"
        inputmode="tel"
      />
      <DsInput v-model="form.email" label="И-мэйл" type="email" :error="errors.email" hint="Байхгүй бол хоосон орхино" />
      <DsInput v-model="form.age" label="Нас" type="number" min="14" max="70" :error="errors.age" />
    </div>
    <slot name="contact-extra" />
  </DsCard>

  <DsCard title="Боловсрол ба хэлний түвшин" eyebrow="2">
    <div class="gks-grid">
      <DsSelect v-model="form.educationLevel" label="Боловсролын түвшин" :options="EDUCATION_OPTIONS" />
      <DsInput v-model="form.schoolName" label="Төгссөн/суралцаж буй сургууль" />
      <DsInput v-model="form.gpa" label="Голч дүн" type="number" step="0.01" min="0" max="100" :error="errors.gpa" />
      <DsInput v-model="form.gpaScale" label="Голчийн шаталбар" placeholder="4.0 / 100" />
      <DsInput v-model="form.koreanLevel" label="Солонгос хэлний түвшин" placeholder="TOPIK 3 / түвшингүй" />
      <DsInput v-model="form.englishLevel" label="Англи хэлний түвшин" placeholder="IELTS 5.5" />
    </div>
  </DsCard>

  <DsCard title="Юу сонирхож байна" eyebrow="3">
    <fieldset class="gks-lead-form__services">
      <legend class="gks-field__label">Сонирхож буй үйлчилгээ</legend>
      <DsCheckbox
        v-for="[service, label] in SERVICE_ENTRIES"
        :key="service"
        :model-value="form.interestedServices.includes(service)"
        :label="label"
        @update:model-value="toggleService(service, $event)"
      />
    </fieldset>

    <div class="gks-grid gks-lead-form__interests">
      <DsInput v-model="form.interestedMajor" label="Сонирхож буй мэргэжил" placeholder="Маркетинг" />
      <DsCombobox
        :model-value="''"
        label="Сонирхож буй сургууль"
        placeholder="Сургууль хайж нэмэх…"
        :options="universityOptions"
        :loading="loadingUniversities"
        hint="Хэд хэдэн сургууль нэмж болно"
        @update:model-value="addUniversity"
      />
    </div>

    <ul v-if="pickedUniversities.length" class="gks-lead-form__picked">
      <li v-for="picked in pickedUniversities" :key="picked.id">
        <DsTag removable @remove="removeUniversity(picked.id)">{{ picked.label }}</DsTag>
      </li>
    </ul>
  </DsCard>

  <DsCard title="Зөвлөгөө ба дараагийн алхам" eyebrow="4">
    <div class="gks-grid">
      <DsSelect v-if="variant === 'create'" v-model="form.source" label="Хаанаас ирсэн" :options="SOURCE_OPTIONS" />
      <DsSelect
        v-if="variant === 'create'"
        v-model="form.stage"
        label="Одоогийн үе шат"
        :options="STAGE_OPTIONS"
        hint="Оффис дээр зөвлөгөө өгсөн бол «Зөвлөгөө өгсөн»"
      />
      <DsSelect v-if="variant === 'create'" v-model="form.assignedToId" label="Хариуцах ажилтан" :options="staffOptions" />
      <DsInput v-model="form.nextContactAt" label="Дараагийн холбогдох огноо" type="date" />
      <DsInput
        v-model="form.winProbability"
        label="Гэрээ болох магадлал"
        type="number"
        min="0"
        max="100"
        suffix="%"
        :error="errors.winProbability"
      />
    </div>
    <DsTextarea
      v-model="form.note"
      label="Зөвлөгөөний тэмдэглэл"
      :rows="4"
      placeholder="Юу ярьсан, юунд эргэлзэж байсан, эцэг эх нь юу гэсэн…"
      class="gks-lead-form__note"
    />
    <slot name="footer-extra" />
  </DsCard>
</template>

<style scoped>
.gks-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }

.gks-lead-form__services { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-5); border: 0; padding: 0; margin: 0 0 var(--sp-5); }
.gks-lead-form__services legend { margin-bottom: var(--sp-2); }

.gks-lead-form__interests { margin-top: var(--sp-1); }

.gks-lead-form__picked { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin: var(--sp-4) 0 0; padding: 0; list-style: none; }

.gks-lead-form__note { margin-top: var(--sp-4); }

@media (max-width: 900px) {
  .gks-grid { grid-template-columns: 1fr; }
}
</style>
