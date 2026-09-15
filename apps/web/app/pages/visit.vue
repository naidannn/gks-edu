<script setup lang="ts">
import { publicLeadSchema } from '@gks/shared';
import type { EducationLevel, ServiceType } from '@gks/shared';

/**
 * Office self-registration (1B-21) — the page behind the QR code on the office
 * wall. A visitor waiting for a consultant fills in their own details on their
 * phone, so the consultant opens a record that already exists and corrects it
 * while they talk (`/admin/consultations/[id]`), instead of typing it all up.
 *
 * One page rather than the website form's three steps: the visitor is sitting
 * down with time to spare, and the consultant is the one who follows up. Not a
 * landing page — `noindex` and disallowed in `robots.txt`.
 */
definePageMeta({ layout: 'default' });

const config = useRuntimeConfig();

const submitting = ref(false);
const submitted = ref(false);
const formError = ref<string | null>(null);
const fieldErrors = ref<Record<string, string>>({});

function emptyForm() {
  return {
    lastName: '',
    firstName: '',
    phone: '',
    email: '',
    age: '',
    educationLevel: '' as EducationLevel | '',
    schoolName: '',
    gpa: '',
    koreanLevel: '',
    englishLevel: '',
    interestedServices: [] as ServiceType[],
    interestedMajor: '',
    note: '',
    /** Honeypot — a real visitor never sees this. */
    website: '',
  };
}

const form = reactive(emptyForm());

const educationOptions = [
  { value: '', label: 'Сонгох…' },
  ...Object.entries(EDUCATION_LEVEL_LABELS).map(([value, label]) => ({ value, label })),
];
const serviceOptions = Object.entries(SERVICE_LABELS) as [ServiceType, string][];

function toggleService(service: ServiceType, selected: boolean) {
  form.interestedServices = selected
    ? [...form.interestedServices, service]
    : form.interestedServices.filter((item) => item !== service);
}

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
    schoolName: form.schoolName || undefined,
    gpa: number(form.gpa),
    koreanLevel: form.koreanLevel || undefined,
    englishLevel: form.englishLevel || undefined,
    interestedServices: form.interestedServices.length ? form.interestedServices : undefined,
    interestedMajor: form.interestedMajor || undefined,
    note: form.note || undefined,
    website: form.website || undefined,
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
    formError.value = 'Улаанаар тэмдэглэсэн талбаруудыг шалгана уу.';
    return;
  }

  submitting.value = true;
  try {
    await $fetch('/leads/office', { baseURL: config.public.apiBase, method: 'POST', body: parsed.data });
    submitted.value = true;
    if (import.meta.client) window.scrollTo({ top: 0 });
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    formError.value =
      status === 429
        ? 'Хэт олон бүртгэл илгээгдлээ. Ажилтанд хандана уу.'
        : 'Бүртгэл илгээхэд алдаа гарлаа. Ажилтанд хандана уу.';
  } finally {
    submitting.value = false;
  }
}

/** The same phone may be handed to the next person in the queue. */
function registerAnother() {
  Object.assign(form, emptyForm());
  submitted.value = false;
}

useHead({ title: 'Оффисын бүртгэл' });
useNoIndex();
</script>

<template>
  <div class="gks-visit">
    <DsCard v-if="submitted" accent>
      <div class="gks-visit__done">
        <DsIcon name="circle-check-big" :size="40" />
        <h1 class="gks-visit__done-title">Бүртгэл амжилттай</h1>
        <p class="gks-visit__done-text">
          Баярлалаа! Та түр хүлээнэ үү — зөвлөх тантай удахгүй уулзана.
        </p>
        <DsButton variant="secondary" icon-left="user-plus" @click="registerAnother">Өөр хүн бүртгүүлэх</DsButton>
      </div>
    </DsCard>

    <template v-else>
      <header>
        <span class="gks-eyebrow">GKS EDU оффис</span>
        <h1 class="gks-visit__title">Тавтай морил!</h1>
        <p class="gks-visit__lede">
          Зөвлөгөө авахаа хүлээж байх хооронд мэдээллээ бөглөөрэй. Зөвлөх тань уулзахдаа
          эндээс харж, дутууг хамт нөхнө. Зөвхөн овог, нэр, утас заавал.
        </p>
      </header>

      <DsCard>
        <form novalidate class="gks-visit__form" @submit.prevent="submit">
          <fieldset class="gks-visit__group">
            <legend class="gks-visit__legend">Холбоо барих</legend>
            <DsInput v-model="form.lastName" label="Овог" required autocomplete="family-name" :error="fieldErrors.lastName" />
            <DsInput v-model="form.firstName" label="Нэр" required autocomplete="given-name" :error="fieldErrors.firstName" />
            <DsInput
              v-model="form.phone"
              label="Утасны дугаар"
              required
              inputmode="tel"
              autocomplete="tel"
              placeholder="9911-2233"
              :error="fieldErrors.phone"
            />
            <DsInput v-model="form.email" label="Имэйл" type="email" autocomplete="email" :error="fieldErrors.email" />
          </fieldset>

          <fieldset class="gks-visit__group">
            <legend class="gks-visit__legend">Боловсрол</legend>
            <DsInput v-model="form.age" label="Нас" type="number" inputmode="numeric" :error="fieldErrors.age" />
            <DsSelect
              v-model="form.educationLevel"
              label="Боловсролын түвшин"
              :options="educationOptions"
              :error="fieldErrors.educationLevel"
            />
            <DsInput v-model="form.schoolName" label="Төгссөн/суралцаж буй сургууль" :error="fieldErrors.schoolName" />
            <DsInput v-model="form.gpa" label="Голч дүн" type="number" step="0.01" inputmode="decimal" :error="fieldErrors.gpa" />
            <DsInput v-model="form.koreanLevel" label="Солонгос хэлний түвшин" placeholder="TOPIK 3 / эхлэгч" />
            <DsInput v-model="form.englishLevel" label="Англи хэлний түвшин" placeholder="IELTS 6.0 / дунд" />
          </fieldset>

          <fieldset class="gks-visit__group">
            <legend class="gks-visit__legend">Сонирхол</legend>
            <div class="gks-visit__services">
              <DsCheckbox
                v-for="[value, label] in serviceOptions"
                :key="value"
                :label="label"
                :model-value="form.interestedServices.includes(value)"
                @update:model-value="toggleService(value, $event)"
              />
            </div>
            <DsInput v-model="form.interestedMajor" label="Сонирхож буй мэргэжил" placeholder="Жишээ: Компьютерийн ухаан" />
            <DsTextarea v-model="form.note" label="Асуух зүйл, нэмэлт мэдээлэл" :rows="3" />
          </fieldset>

          <!-- Spam trap: hidden from people, tempting to bots. -->
          <input
            v-model="form.website"
            type="text"
            name="website"
            tabindex="-1"
            autocomplete="off"
            aria-hidden="true"
            class="gks-visit__honeypot"
          >

          <p v-if="formError" class="gks-visit__error">{{ formError }}</p>

          <DsButton variant="accent" type="submit" block :loading="submitting" icon-right="send">Бүртгүүлэх</DsButton>
        </form>
      </DsCard>

      <p class="gks-visit__privacy">
        Таны мэдээллийг зөвхөн зөвлөгөө өгөх зорилгоор ашиглана —
        <NuxtLink to="/privacy">Нууцлалын бодлого</NuxtLink>.
      </p>
    </template>
  </div>
</template>

<style scoped>
.gks-visit {
  display: flex;
  flex-direction: column;
  gap: var(--sp-5);
  max-width: var(--container-narrow);
  margin: 0 auto;
}

.gks-visit__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-heading);
}
.gks-visit__lede { margin-top: var(--sp-3); color: var(--text-muted); line-height: var(--lh-body); }

.gks-visit__form { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-visit__group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
.gks-visit__legend {
  grid-column: 1 / -1;
  margin-bottom: var(--sp-3);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--text-strong);
}
.gks-visit__services { grid-column: 1 / -1; display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-visit__group :deep(.gks-field:has(textarea)) { grid-column: 1 / -1; }
.gks-visit__honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }

.gks-visit__error {
  padding: var(--sp-3);
  font-size: var(--fs-body-sm);
  color: var(--danger-fg);
  background: var(--danger-bg);
  border: var(--border-hair) solid var(--danger-line);
}

.gks-visit__privacy { font-size: var(--fs-caption); color: var(--text-subtle); text-align: center; }

.gks-visit__done { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); padding: var(--sp-6) 0; text-align: center; }
.gks-visit__done svg { color: var(--green-600); }
.gks-visit__done-title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); }
.gks-visit__done-text { color: var(--text-muted); line-height: var(--lh-body); max-width: 44ch; }

@media (max-width: 720px) {
  .gks-visit__group { grid-template-columns: minmax(0, 1fr); }
}
</style>
