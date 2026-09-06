<script setup lang="ts">
import { publicLeadSchema } from '@gks/shared';
import type {
  EducationLevel,
  PublicLeadPayload,
  ServiceType,
  UniversityCard,
} from '@gks/shared';

/** Multi-step consultation request: contact → education → interest (1A-16). */
const route = useRoute();
const config = useRuntimeConfig();

const STEPS = ['Холбоо барих', 'Боловсрол', 'Сонирхол'] as const;
const step = ref(0);
const submitting = ref(false);
const submitted = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

/** A visitor arriving from a service card starts with that service ticked. */
const initialService = (() => {
  const value = route.query.service;
  return typeof value === 'string' && value in SERVICE_LABELS ? (value as ServiceType) : null;
})();

/** A visitor arriving from the homepage roadmap widget keeps their target-date note. */
const initialNote = (() => {
  const value = route.query.note;
  return typeof value === 'string' ? value.slice(0, 2000) : '';
})();

const form = reactive({
  lastName: '',
  firstName: '',
  phone: '',
  email: '',
  age: '',
  educationLevel: '' as EducationLevel | '',
  gpa: '',
  koreanLevel: '',
  englishLevel: '',
  interestedServices: (initialService ? [initialService] : []) as ServiceType[],
  interestedMajor: '',
  note: initialNote,
  /** Honeypot — a real visitor never sees this. */
  website: '',
});

const educationOptions = [
  { value: '', label: 'Сонгох…' },
  ...Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];

const serviceOptions = Object.entries(SERVICE_LABELS) as [ServiceType, string][];

// A visitor arriving from a university page keeps that school attached.
const universitySlug = computed(() => {
  const value = route.query.university;
  return typeof value === 'string' ? value : '';
});

const { data: university } = await useApiFetch<UniversityCard>(
  () => `/universities/${universitySlug.value}`,
  { immediate: Boolean(universitySlug.value), lazy: true },
);

function toggleService(service: ServiceType, selected: boolean) {
  form.interestedServices = selected
    ? [...form.interestedServices, service]
    : form.interestedServices.filter((item) => item !== service);
}

/** Step 1 is the only one that must be complete — the rest is optional detail. */
const canContinue = computed(() =>
  step.value !== 0 || (form.lastName.trim().length >= 2 && form.firstName.trim().length >= 2 && form.phone.trim() !== ''),
);

function buildPayload() {
  const number = (value: string) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    lastName: form.lastName,
    firstName: form.firstName,
    phone: form.phone,
    email: form.email || undefined,
    age: number(form.age),
    educationLevel: form.educationLevel || undefined,
    gpa: number(form.gpa),
    koreanLevel: form.koreanLevel || undefined,
    englishLevel: form.englishLevel || undefined,
    interestedServices: form.interestedServices.length ? form.interestedServices : undefined,
    interestedUniversitySlugs: universitySlug.value ? [universitySlug.value] : undefined,
    interestedMajor: form.interestedMajor || undefined,
    note: form.note || undefined,
    website: form.website || undefined,
    utm: {
      source: typeof route.query.utm_source === 'string' ? route.query.utm_source : undefined,
      medium: typeof route.query.utm_medium === 'string' ? route.query.utm_medium : undefined,
      campaign: typeof route.query.utm_campaign === 'string' ? route.query.utm_campaign : undefined,
      landingPage: route.fullPath,
      referrer: import.meta.client ? document.referrer || undefined : undefined,
    },
  };
}

async function submit() {
  formError.value = null;
  fieldErrors.value = {};

  const parsed = publicLeadSchema.safeParse(buildPayload());
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !fieldErrors.value[key]) fieldErrors.value[key] = issue.message;
    }
    // Contact fields live on the first step; send the visitor back to fix them.
    if (['lastName', 'firstName', 'phone', 'email'].some((key) => fieldErrors.value[key])) step.value = 0;
    formError.value = 'Хүсэлтийг илгээхийн өмнө тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  submitting.value = true;
  try {
    await $fetch<{ id: string; merged: boolean }>('/leads/public', {
      baseURL: config.public.apiBase,
      method: 'POST',
      body: parsed.data satisfies PublicLeadPayload,
    });
    submitted.value = true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    formError.value =
      status === 429
        ? 'Хэт олон хүсэлт илгээгдлээ. Түр хүлээгээд дахин оролдоно уу.'
        : 'Хүсэлт илгээхэд алдаа гарлаа. Утсаар холбогдоно уу: 7710-9000.';
  } finally {
    submitting.value = false;
  }
}

useHead({ title: 'Зөвлөгөө авах' });
useSeoMeta({
  description:
    'Солонгост суралцах зөвлөгөө авах хүсэлт. Хэлний бэлтгэл, бакалавр, магистр, доктор, ' +
    'GKS тэтгэлгийн зуучлал — GKS EDU GROUP.',
  ogTitle: 'Үнэгүй зөвлөгөө авах · GKS Edu',
  ogDescription: 'Хэдхэн талбар бөглөөд зөвлөхтэй холбогдоорой.',
  ogType: 'website',
});
</script>

<template>
  <div class="gks-lead">
    <DsCard v-if="submitted" accent>
      <div class="gks-lead__done">
        <DsIcon name="circle-check-big" :size="40" />
        <h1 class="gks-lead__done-title">Хүсэлт хүлээн авлаа</h1>
        <p class="gks-lead__done-text">
          Манай зөвлөх ажлын 1 өдрийн дотор танай утсаар холбогдоно. Түргэн шаардлагатай бол
          <strong class="gks-tnum">7710-9000</strong> дугаарт залгаарай.
        </p>
        <div class="gks-lead__done-actions">
          <DsButton variant="secondary" @click="navigateTo('/universities')">Сургууль үзэх</DsButton>
          <DsButton variant="primary" @click="navigateTo('/')">Нүүр хуудас</DsButton>
        </div>
      </div>
    </DsCard>

    <template v-else>
      <header class="gks-lead__head">
        <span class="gks-eyebrow">Зөвлөгөө</span>
        <h1 class="gks-lead__title">Солонгост суралцах зөвлөгөө авах</h1>
        <p class="gks-lead__lede">
          3 алхамд мэдээллээ үлдээгээрэй. Зөвлөх тань боловсрол, хэлний түвшинд тохирсон
          сургууль, хөтөлбөр, хугацааг тодруулж өгнө.
        </p>
      </header>

      <ol class="gks-steps" aria-label="Алхмууд">
        <li
          v-for="(label, index) in STEPS"
          :key="label"
          class="gks-steps__item"
          :class="{
            'gks-steps__item--active': index === step,
            'gks-steps__item--done': index < step,
          }"
        >
          <span class="gks-steps__index gks-tnum">{{ index + 1 }}</span>
          <span>{{ label }}</span>
        </li>
      </ol>

      <DsCard>
        <form novalidate @submit.prevent="submit">
          <!-- Алхам 1 — холбоо барих -->
          <div v-show="step === 0" class="gks-lead__fields">
            <DsInput
              v-model="form.lastName"
              label="Овог"
              required
              autocomplete="family-name"
              :error="fieldErrors.lastName"
            />
            <DsInput
              v-model="form.firstName"
              label="Нэр"
              required
              autocomplete="given-name"
              :error="fieldErrors.firstName"
            />
            <DsInput
              v-model="form.phone"
              label="Утасны дугаар"
              required
              inputmode="tel"
              autocomplete="tel"
              placeholder="9911-2233"
              :error="fieldErrors.phone"
            />
            <DsInput
              v-model="form.email"
              label="Имэйл"
              type="email"
              autocomplete="email"
              hint="Заавал биш"
              :error="fieldErrors.email"
            />
          </div>

          <!-- Алхам 2 — боловсрол -->
          <div v-show="step === 1" class="gks-lead__fields">
            <DsSelect
              v-model="form.educationLevel"
              label="Боловсролын түвшин"
              :options="educationOptions"
              :error="fieldErrors.educationLevel"
            />
            <DsInput v-model="form.age" label="Нас" type="number" inputmode="numeric" :error="fieldErrors.age" />
            <DsInput
              v-model="form.gpa"
              label="Голч дүн"
              type="number"
              step="0.01"
              hint="Аль шаталбараар бодсоноо тэмдэглэлдээ бичээрэй"
              :error="fieldErrors.gpa"
            />
            <DsInput v-model="form.koreanLevel" label="Солонгос хэлний түвшин" placeholder="TOPIK 3 / эхлэгч" />
            <DsInput v-model="form.englishLevel" label="Англи хэлний түвшин" placeholder="IELTS 6.0 / дунд" />
          </div>

          <!-- Алхам 3 — сонирхол -->
          <div v-show="step === 2" class="gks-lead__fields">
            <fieldset class="gks-lead__services">
              <legend class="gks-lead__legend">Сонирхож буй үйлчилгээ</legend>
              <DsCheckbox
                v-for="[value, label] in serviceOptions"
                :key="value"
                :label="label"
                :model-value="form.interestedServices.includes(value)"
                @update:model-value="toggleService(value, $event)"
              />
            </fieldset>

            <div v-if="university" class="gks-lead__university">
              <span class="gks-lead__legend">Сонирхож буй сургууль</span>
              <DsTag selected>{{ university.nameEn }}</DsTag>
            </div>

            <DsInput v-model="form.interestedMajor" label="Сонирхож буй мэргэжил" placeholder="Жишээ: Компьютерийн ухаан" />
            <DsTextarea v-model="form.note" label="Нэмэлт тэмдэглэл, асуулт" :rows="4" />

            <!-- Spam trap: hidden from people, tempting to bots. -->
            <input
              v-model="form.website"
              type="text"
              name="website"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
              class="gks-lead__honeypot"
            >
          </div>

          <p v-if="formError" class="gks-lead__error">{{ formError }}</p>

          <div class="gks-lead__actions">
            <DsButton
              v-if="step > 0"
              variant="secondary"
              icon-left="chevron-left"
              @click="step -= 1"
            >
              Буцах
            </DsButton>
            <span class="gks-lead__spacer" />
            <DsButton
              v-if="step < STEPS.length - 1"
              variant="primary"
              icon-right="chevron-right"
              :disabled="!canContinue"
              @click="step += 1"
            >
              Үргэлжлүүлэх
            </DsButton>
            <DsButton v-else variant="accent" type="submit" :loading="submitting" icon-right="send">
              Хүсэлт илгээх
            </DsButton>
          </div>
        </form>
      </DsCard>

      <p class="gks-lead__privacy">
        Илгээсэн мэдээллийг зөвхөн зөвлөгөө өгөх зорилгоор ашиглана. Бид гуравдагч этгээдэд
        дамжуулахгүй — <NuxtLink to="/privacy">Нууцлалын бодлого</NuxtLink>.
      </p>
    </template>
  </div>
</template>

<style scoped>
.gks-lead {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  max-width: var(--container-narrow);
  margin: 0 auto;
}

.gks-lead__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-lead__lede { margin-top: var(--sp-3); color: var(--text-muted); line-height: var(--lh-body); }

.gks-steps { display: flex; gap: var(--sp-2); }
.gks-steps__item {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: 1;
  padding: var(--sp-3);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-bottom: var(--border-rail) solid var(--line-hairline);
}
.gks-steps__item--active { color: var(--text-strong); border-bottom-color: var(--brand-600); }
.gks-steps__item--done { color: var(--text-muted); border-bottom-color: var(--green-600); }
.gks-steps__index {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: var(--surface-sunken);
  border: var(--border-hair) solid var(--line-hairline);
  font-weight: var(--fw-bold);
}

.gks-lead__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-lead__services, .gks-lead__university { grid-column: 1 / -1; display: flex; flex-direction: column; gap: var(--sp-3); }
/* Keep the chosen university a chip, not a full-width bar. */
.gks-lead__university { align-items: flex-start; }
.gks-lead__legend { font-size: var(--fs-label); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-lead__fields :deep(.gks-field:has(textarea)) { grid-column: 1 / -1; }
.gks-lead__honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

.gks-lead__error {
  margin-top: var(--sp-4);
  padding: var(--sp-3);
  font-size: var(--fs-body-sm);
  color: var(--danger-fg);
  background: var(--danger-bg);
  border: var(--border-hair) solid var(--danger-line);
}

.gks-lead__actions { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-6); }
.gks-lead__spacer { flex: 1; }

.gks-lead__privacy { font-size: var(--fs-caption); color: var(--text-subtle); text-align: center; }

.gks-lead__done { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); padding: var(--sp-6) 0; text-align: center; }
.gks-lead__done svg { color: var(--green-600); }
.gks-lead__done-title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-lead__done-text { color: var(--text-muted); line-height: var(--lh-body); max-width: 52ch; }
.gks-lead__done-actions { display: flex; gap: var(--sp-3); }

@media (max-width: 720px) {
  .gks-lead__fields { grid-template-columns: minmax(0, 1fr); }
  .gks-steps { flex-direction: column; }
}
</style>
