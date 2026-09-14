<script setup lang="ts">
import type { ClientDetail, ServiceType } from '@gks/shared';
import type { ClientUniversityChoice } from '~/utils/client-form';
import { defaultChoiceTrack, retrackChoices } from '~/utils/client-form';

/**
 * Open the brokerage service on a client who was registered without one.
 *
 * Registration offers "Зуучлалын үйлчилгээг шууд эхлүүлэх" and leaving it
 * unticked writes a client with no `Case` — which is every screen's subject, so
 * without one there is no stage, no contract, no payment and no checklist. Until
 * this card existed the only way back was to register the person a second time.
 */
const props = defineProps<{ client: ClientDetail }>();
const emit = defineEmits<{ changed: [] }>();

const api = useApi();

const SERVICE_OPTIONS = selectOptions(SERVICE_LABELS, 'Үйлчилгээ сонгоно уу');

const { universities, loading: universitiesLoading, load: loadUniversities } = useUniversityCatalogue();
onMounted(loadUniversities);

/** Seeded from the record the office already filled in at registration. */
const serviceType = ref<ServiceType | ''>(props.client.primaryServiceType ?? '');
const choices = ref<ClientUniversityChoice[]>([
  {
    universityId: props.client.targetUniversityId ?? '',
    track: defaultChoiceTrack(props.client.primaryServiceType ?? ''),
  },
]);

// A GKS service tracks its schools differently from ordinary brokerage, and the
// limits differ too — the same re-tracking the registration form runs.
watch(serviceType, () => { choices.value = retrackChoices(serviceType.value, choices.value); });

const submitting = ref(false);
const error = ref<string | null>(null);

async function start() {
  error.value = null;
  if (!serviceType.value) {
    error.value = 'Үйлчилгээг сонгоно уу.';
    return;
  }

  submitting.value = true;
  try {
    await api.post('/cases', {
      userId: props.client.userId,
      serviceType: serviceType.value,
      universityChoices: choices.value
        .filter((choice) => choice.universityId)
        .map((choice) => ({ universityId: choice.universityId, track: choice.track })),
    });
    emit('changed');
  } catch (err) {
    error.value = apiErrorMessage(err, 'Үйлчилгээ эхлүүлэхэд алдаа гарлаа.');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <DsCard title="Үйлчилгээ эхлээгүй">
    <div class="gks-startcase">
      <p class="gks-startcase__help">
        Энэ үйлчлүүлэгчийг бүртгэхдээ «Зуучлалын үйлчилгээг шууд эхлүүлэх» сонголтыг тэмдэглээгүй тул явц, гэрээ,
        төлбөр, материал үүсээгүй байна. Доороос үйлчилгээг эхлүүлбэл «Гэрээ бэлтгэж буй» шатнаас цааш ажиллана.
      </p>

      <DsSelect v-model="serviceType" label="Сонгосон үйлчилгээ" :options="SERVICE_OPTIONS" />

      <CrmUniversityChoices
        v-model="choices"
        :service-type="serviceType"
        :universities="universities"
        :loading="universitiesLoading"
      />

      <p v-if="error" class="gks-startcase__error">{{ error }}</p>

      <DsButton variant="accent" icon-left="folder-plus" :loading="submitting" @click="start">
        Үйлчилгээ эхлүүлэх
      </DsButton>
    </div>
  </DsCard>
</template>

<style scoped>
.gks-startcase { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-4); }
.gks-startcase__help { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-startcase__error { font-size: var(--fs-caption); color: var(--danger-fg); }
.gks-startcase :deep(.gks-select), .gks-startcase :deep(.gks-choices) { width: 100%; }
</style>
