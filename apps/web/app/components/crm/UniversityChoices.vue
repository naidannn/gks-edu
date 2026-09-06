<script setup lang="ts">
import type { ServiceType, UniversityCard } from '@gks/shared';
import type { ClientUniversityChoice } from '~/utils/client-form';
import { choiceLimitsFor } from '~/utils/client-form';

/**
 * The schools a client picks on one contract (§5.1).
 *
 * A GKS contract is two applications at once: the scholarship, entered with two
 * schools, and the single ordinary-brokerage school the contract grants free of
 * charge (§3.11) so a refused scholarship still leaves somewhere to go. Ordinary
 * brokerage picks up to three schools. Neither costs a won more than one school
 * would, which is why the price line never appears here.
 */
const choices = defineModel<ClientUniversityChoice[]>({ required: true });

const props = defineProps<{
  serviceType: ServiceType | '';
  universities: UniversityCard[];
  loading?: boolean;
  error?: string;
}>();

const limits = computed(() => choiceLimitsFor(props.serviceType));
const isScholarship = computed(() => limits.value.scholarship > 0);

const options = computed(() => toUniversityOptions(props.universities, 'Сургууль сонгох'));

/** Indices into the model, so a row edits the array in place. */
function rowsOf(track: ClientUniversityChoice['track']): number[] {
  return choices.value.flatMap((choice, index) => (choice.track === track ? [index] : []));
}

const scholarshipRows = computed(() => rowsOf('SCHOLARSHIP'));
const regularRows = computed(() => rowsOf('REGULAR'));

function add(track: ClientUniversityChoice['track']): void {
  choices.value = [...choices.value, { universityId: '', track }];
}

function remove(index: number): void {
  const next = choices.value.filter((_, position) => position !== index);
  // The form always shows at least one school row, so the last one empties
  // rather than disappearing.
  choices.value = next.length > 0 ? next : [{ universityId: '', track: choices.value[index]!.track }];
}

function update(index: number, universityId: string): void {
  choices.value = choices.value.map((choice, position) =>
    position === index ? { ...choice, universityId } : choice,
  );
}

/** A school already picked on another row cannot be picked again. */
function optionsFor(index: number) {
  const taken = new Set(
    choices.value.flatMap((choice, position) =>
      position !== index && choice.universityId ? [choice.universityId] : [],
    ),
  );
  return options.value.filter((option) => !taken.has(option.value));
}

const scholarshipFull = computed(() => scholarshipRows.value.length >= limits.value.scholarship);
const regularFull = computed(() => regularRows.value.length >= limits.value.regular);
</script>

<template>
  <div class="gks-choices">
    <section v-if="isScholarship" class="gks-choices__block">
      <header class="gks-choices__head">
        <h3 class="gks-choices__title">Тэтгэлэгт мэдүүлэх сургууль</h3>
        <p class="gks-choices__hint">Засгийн газрын тэтгэлэгт {{ limits.scholarship }} хүртэл сургууль сонгоно.</p>
      </header>

      <div v-for="(index, position) in scholarshipRows" :key="`s-${index}`" class="gks-choices__row">
        <DsCombobox
          :model-value="choices[index]!.universityId"
          :label="position === 0 ? 'Үндсэн сонголт' : `${position + 1}-р сонголт`"
          :options="optionsFor(index)"
          :loading="loading"
          @update:model-value="update(index, $event)"
        />
        <DsIconButton
          v-if="scholarshipRows.length > 1"
          icon="trash"
          label="Хасах"
          class="gks-choices__remove"
          @click="remove(index)"
        />
      </div>

      <DsButton v-if="!scholarshipFull" variant="secondary" icon-left="plus" @click="add('SCHOLARSHIP')">
        Тэтгэлгийн сургууль нэмэх
      </DsButton>
    </section>

    <section class="gks-choices__block">
      <header class="gks-choices__head">
        <h3 class="gks-choices__title">
          {{ isScholarship ? 'Нэмэлт энгийн зуучлалын сургууль' : 'Зорилтот сургууль' }}
        </h3>
        <p class="gks-choices__hint">
          <template v-if="isScholarship">
            Тэтгэлэгт тэнцээгүй тохиолдолд {{ limits.regular }} сургуульд үндсэн ангид нэмэлт төлбөргүй зуучилна
            (гэрээний 3.11).
          </template>
          <template v-else>
            {{ limits.regular }} хүртэл сургууль сонгож болно — олон сургууль сонгосон ч төлбөр нэмэгдэхгүй.
          </template>
        </p>
      </header>

      <div v-for="(index, position) in regularRows" :key="`r-${index}`" class="gks-choices__row">
        <DsCombobox
          :model-value="choices[index]!.universityId"
          :label="isScholarship ? 'Нэмэлт сургууль' : position === 0 ? 'Үндсэн сонголт' : `${position + 1}-р сонголт`"
          :options="optionsFor(index)"
          :loading="loading"
          @update:model-value="update(index, $event)"
        />
        <DsIconButton
          v-if="regularRows.length > 1 || isScholarship"
          icon="trash"
          label="Хасах"
          class="gks-choices__remove"
          @click="remove(index)"
        />
      </div>

      <DsButton v-if="!regularFull" variant="secondary" icon-left="plus" @click="add('REGULAR')">
        {{ isScholarship ? 'Нэмэлт сургууль сонгох' : 'Сургууль нэмэх' }}
      </DsButton>
    </section>

    <p v-if="error" class="gks-choices__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.gks-choices { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-choices__block { display: flex; flex-direction: column; gap: var(--sp-3); align-items: flex-start; }
.gks-choices__head { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-choices__title { margin: 0; font-size: var(--fs-body); font-weight: 600; }
.gks-choices__hint { margin: 0; color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-choices__row { display: flex; align-items: flex-end; gap: var(--sp-2); width: 100%; }
.gks-choices__row > :first-child { flex: 1 1 auto; min-width: 0; }
.gks-choices__remove { flex: 0 0 auto; margin-bottom: var(--sp-1); }
.gks-choices__error { margin: 0; color: var(--danger-fg); font-size: var(--fs-body-sm); }
</style>
