<script setup lang="ts">
import type {
  AudiencePreview,
  ClientStatus,
  LeadSource,
  LeadStage,
  MarketingAudience,
  MarketingTemplateItem,
  ServiceType,
} from '@gks/shared';
import { applyTemplate, filtersFromForm, type CampaignForm } from '~/utils/campaign-form';
import {
  EMAIL_TONE_LABELS,
  MARKETING_AUDIENCE_HINTS,
  MARKETING_AUDIENCE_LABELS,
  MARKETING_PLACEHOLDERS,
} from '~/utils/marketing';

/**
 * Everything a mass mail needs, in the order the decision is actually made:
 * who it goes to, then what it says (1O).
 *
 * The recipient count above the fold is the point of the screen. A campaign is
 * irreversible, and the one question somebody has before pressing send is "how
 * many people is this?" — so the number is live, it comes from the same query
 * the send will run, and it is never a guess from the client side.
 */
const form = defineModel<CampaignForm>({ required: true });

const props = defineProps<{
  errors: Record<string, string>;
  templates: MarketingTemplateItem[];
  /** The draft editor locks the audience once recipients have been frozen. */
  readonly?: boolean;
}>();

const api = useApi();

const AUDIENCE_OPTIONS = selectOptions(MARKETING_AUDIENCE_LABELS);
const TONE_OPTIONS = selectOptions(EMAIL_TONE_LABELS);
const LEAD_STAGE_ENTRIES = Object.entries(LEAD_STAGE_LABELS) as [LeadStage, string][];
const LEAD_SOURCE_ENTRIES = Object.entries(LEAD_SOURCE_LABELS) as [LeadSource, string][];
const CLIENT_STATUS_ENTRIES = Object.entries(CLIENT_STATUS_LABELS) as [ClientStatus, string][];
const SERVICE_ENTRIES = Object.entries(SERVICE_LABELS) as [ServiceType, string][];

const templateOptions = computed(() => [
  { value: '', label: 'Загваргүй — өөрөө бичих' },
  ...props.templates.filter((row) => row.isActive).map((row) => ({ value: row.id, label: row.name })),
]);

function pickTemplate(id: string) {
  const template = props.templates.find((row) => row.id === id);
  form.value = template ? applyTemplate(form.value, template) : { ...form.value, templateId: '' };
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

// ── Live recipient count ───────────────────────────────────────────────────

const preview = ref<AudiencePreview | null>(null);
const counting = ref(false);
const countError = ref<string | null>(null);

/**
 * Debounced, because the audience block is a row of checkboxes and a person
 * ticking four of them would otherwise run four queries over the whole client
 * table — the last of which is the only one anybody reads.
 */
let timer: ReturnType<typeof setTimeout> | undefined;

async function refreshCount() {
  counting.value = true;
  countError.value = null;
  try {
    preview.value = await api.post<AudiencePreview>('/marketing/audience/preview', {
      audience: form.value.audience,
      filters: filtersFromForm(form.value),
    });
  } catch (error) {
    preview.value = null;
    countError.value = apiErrorMessage(error, 'Хүлээн авагчийг тоолж чадсангүй');
  } finally {
    counting.value = false;
  }
}

watch(
  () => [
    form.value.audience,
    form.value.leadStages,
    form.value.leadSources,
    form.value.clientStatuses,
    form.value.serviceTypes,
    form.value.tags,
    form.value.createdFrom,
    form.value.createdTo,
    form.value.emails,
  ],
  () => {
    clearTimeout(timer);
    timer = setTimeout(refreshCount, 400);
  },
  { deep: true, immediate: true },
);

onBeforeUnmount(() => clearTimeout(timer));

const isLeadAudience = computed(() => form.value.audience === 'LEADS');
const isClientAudience = computed(
  () => form.value.audience === 'CLIENTS' || form.value.audience === 'CONTRACT_CLIENTS',
);
</script>

<template>
  <div class="gks-campaign-form">
    <DsCard title="Хэнд илгээх вэ" eyebrow="Сегмент">
      <div class="gks-form-grid">
        <DsSelect
          v-model="form.audience"
          label="Хүлээн авагчид"
          :options="AUDIENCE_OPTIONS"
          :disabled="readonly"
          :hint="MARKETING_AUDIENCE_HINTS[form.audience as MarketingAudience]"
          class="gks-form-grid__full"
        />

        <template v-if="isLeadAudience">
          <div class="gks-campaign-form__group">
            <p class="gks-campaign-form__group-title">Шат</p>
            <div class="gks-campaign-form__checks">
              <DsCheckbox
                v-for="[stage, label] in LEAD_STAGE_ENTRIES"
                :key="stage"
                :label="label"
                :disabled="readonly"
                :model-value="form.leadStages.includes(stage)"
                @update:model-value="form.leadStages = toggle(form.leadStages, stage)"
              />
            </div>
          </div>
          <div class="gks-campaign-form__group">
            <p class="gks-campaign-form__group-title">Эх сурвалж</p>
            <div class="gks-campaign-form__checks">
              <DsCheckbox
                v-for="[source, label] in LEAD_SOURCE_ENTRIES"
                :key="source"
                :label="label"
                :disabled="readonly"
                :model-value="form.leadSources.includes(source)"
                @update:model-value="form.leadSources = toggle(form.leadSources, source)"
              />
            </div>
          </div>
        </template>

        <template v-if="isClientAudience">
          <div class="gks-campaign-form__group">
            <p class="gks-campaign-form__group-title">Төлөв</p>
            <div class="gks-campaign-form__checks">
              <DsCheckbox
                v-for="[status, label] in CLIENT_STATUS_ENTRIES"
                :key="status"
                :label="label"
                :disabled="readonly"
                :model-value="form.clientStatuses.includes(status)"
                @update:model-value="form.clientStatuses = toggle(form.clientStatuses, status)"
              />
            </div>
          </div>
          <div class="gks-campaign-form__group">
            <p class="gks-campaign-form__group-title">Үйлчилгээ</p>
            <div class="gks-campaign-form__checks">
              <DsCheckbox
                v-for="[service, label] in SERVICE_ENTRIES"
                :key="service"
                :label="label"
                :disabled="readonly"
                :model-value="form.serviceTypes.includes(service)"
                @update:model-value="form.serviceTypes = toggle(form.serviceTypes, service)"
              />
            </div>
          </div>
        </template>

        <DsInput
          v-if="form.audience === 'SUBSCRIBERS'"
          v-model="form.tags"
          label="Шошго"
          hint="Таслалаар тусгаарлана. Хоосон бол бүх захиалагч."
          :disabled="readonly"
          class="gks-form-grid__full"
        />

        <DsTextarea
          v-if="form.audience === 'CUSTOM'"
          v-model="form.emails"
          label="Имэйл хаягууд"
          hint="Мөр бүрт нэг хаяг, эсвэл таслалаар тусгаарлан буулгана уу."
          :rows="6"
          :error="errors.emails"
          :disabled="readonly"
          class="gks-form-grid__full"
        />

        <template v-if="form.audience !== 'CUSTOM'">
          <DsInput v-model="form.createdFrom" label="Бүртгэгдсэн: эхлэх" type="date" :disabled="readonly" />
          <DsInput v-model="form.createdTo" label="Бүртгэгдсэн: дуусах" type="date" :disabled="readonly" />
        </template>
      </div>

      <div class="gks-campaign-form__count" :class="{ 'gks-campaign-form__count--empty': preview?.total === 0 }">
        <DsIcon name="users" :size="18" />
        <p v-if="counting" class="gks-campaign-form__count-text">Тоолж байна…</p>
        <p v-else-if="countError" class="gks-campaign-form__count-text">{{ countError }}</p>
        <p v-else class="gks-campaign-form__count-text">
          <strong class="gks-tnum">{{ formatNumber(preview?.total ?? 0) }}</strong> хүн хүлээн авна.
          <span v-if="preview?.total === 0">Сонголтоо өөрчилнө үү.</span>
        </p>
        <span v-if="preview?.sample.length" class="gks-campaign-form__sample">
          {{ preview.sample.map((row) => row.email).slice(0, 3).join(', ') }}…
        </span>
      </div>
      <p class="gks-campaign-form__note">
        Захиалгаас гарсан болон хаяг нь ажиллахгүй болсон хүмүүсийг энэ тооноос аль хэдийн хассан.
      </p>
    </DsCard>

    <DsCard title="Юу илгээх вэ" eyebrow="Агуулга">
      <div class="gks-form-grid">
        <DsInput
          v-model="form.name"
          label="Кампанит ажлын нэр"
          hint="Зөвхөн дотоод хэрэглээнд — хүлээн авагч харахгүй."
          :error="errors.name"
          required
          class="gks-form-grid__full"
        />

        <DsSelect
          :model-value="form.templateId"
          label="Загвар"
          :options="templateOptions"
          :disabled="readonly"
          @update:model-value="pickTemplate"
        />
        <DsSelect v-model="form.tone" label="Өнгө аяс" :options="TONE_OPTIONS" :disabled="readonly" />

        <DsInput
          v-model="form.subject"
          label="Гарчиг (subject)"
          :error="errors.subject"
          :disabled="readonly"
          required
          class="gks-form-grid__full"
        />
        <DsInput v-model="form.eyebrow" label="Ангилал" hint="Жишээ: GKS тэтгэлэг" :disabled="readonly" />
        <DsInput v-model="form.heading" label="Том гарчиг" hint="Хоосон бол subject-ийг ашиглана." :disabled="readonly" />

        <DsTextarea
          v-model="form.bodyMn"
          label="Агуулга"
          :rows="14"
          :error="errors.bodyMn"
          :disabled="readonly"
          class="gks-form-grid__full"
        />

        <p class="gks-campaign-form__hint gks-form-grid__full">
          <code v-for="item in MARKETING_PLACEHOLDERS" :key="item.name">{{ item.name }}</code>
          орлуулга илгээх үед бөглөгдөнө. <code>Нэр: утга</code> мөрүүд хүснэгт болж,
          <code>- </code>-аар эхэлсэн мөрүүд жагсаалт болно.
        </p>

        <DsInput v-model="form.ctaLabel" label="Товчны бичиг" :disabled="readonly" />
        <DsInput
          v-model="form.ctaUrl"
          label="Товчны холбоос"
          placeholder="https://gksedu.mn/…"
          :error="errors.ctaUrl"
          :disabled="readonly"
        />
        <DsInput
          v-model="form.footerNote"
          label="Хөлийн тэмдэглэл"
          hint="Захидлын доод талд гарах нэг мөр."
          :disabled="readonly"
          class="gks-form-grid__full"
        />
      </div>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-campaign-form { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-campaign-form__group { display: flex; flex-direction: column; gap: var(--sp-1); }
.gks-campaign-form__group-title {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-subtle);
}
.gks-campaign-form__checks { display: flex; flex-wrap: wrap; gap: 0 var(--sp-4); }
.gks-campaign-form__count {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin-top: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-2);
  background: var(--surface-sunken);
  color: var(--text-body);
}
.gks-campaign-form__count--empty { color: var(--warning-fg); }
.gks-campaign-form__count-text { font-size: var(--fs-body-sm); margin: 0; }
.gks-campaign-form__sample { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-campaign-form__note { margin-top: var(--sp-2); font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-campaign-form__hint { font-size: var(--fs-micro); color: var(--text-subtle); }
.gks-campaign-form__hint code {
  padding: 1px 5px;
  margin-right: 4px;
  border-radius: var(--radius-1);
  background: var(--surface-sunken);
}
</style>
