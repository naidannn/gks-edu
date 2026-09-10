<script setup lang="ts">
import type { IntakeTerm, PortalCaseDetail, ServiceOption, ServiceType } from '@gks/shared';

/**
 * Self-service: the client picks a service, confirms what it costs, and the
 * platform opens the case and issues the electronic brokerage contract for
 * them to sign (1C-23). The signature itself still goes through accept → a
 * six-digit code emailed to the account address, exactly as a staff-issued
 * contract does (1C-08).
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });
useHead({ title: 'Үйлчилгээ эхлүүлэх' });

const api = useApi();
const route = useRoute();
const { overview, load, refresh } = usePortal();
const catalogue = useUniversityCatalogue();

const services = ref<ServiceOption[]>([]);
const loading = ref(true);
const step = ref<1 | 2 | 3>(1);
const chosen = ref<ServiceType | null>(null);
const universityId = ref('');
const intakeId = ref('');
const targetMajor = ref('');
const intakes = ref<IntakeTerm[]>([]);
const intakesLoading = ref(false);
const submitting = ref(false);
const errorMsg = ref<string | null>(null);

onMounted(async () => {
  catalogue.load();
  await load();
  try {
    services.value = await api.get<ServiceOption[]>('/me/services');
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Үйлчилгээний жагсаалтыг ачаалж чадсангүй');
  } finally {
    loading.value = false;
  }

  // `/universities/<slug>` links here with the school already chosen.
  const preselect = route.query.service;
  if (typeof preselect === 'string' && services.value.some((s) => s.serviceType === preselect && s.available)) {
    chosen.value = preselect as ServiceType;
    step.value = 2;
  }
  if (typeof route.query.universityId === 'string') universityId.value = route.query.universityId;
  // `/admissions` and the school page link straight to one round.
  if (typeof route.query.intakeId === 'string') intakeId.value = route.query.intakeId;
});

/**
 * The rounds this school still accepts, for the chosen service (1H-07).
 *
 * Loaded per school rather than up front: the catalogue has 135 of them, and
 * a visitor only ever needs the one they picked.
 */
async function loadIntakes(schoolId: string) {
  if (!schoolId) {
    intakes.value = [];
    return;
  }
  intakesLoading.value = true;
  try {
    intakes.value = await api.get<IntakeTerm[]>(`/admissions/university/${schoolId}`);
  } catch {
    // A missing calendar must not block opening a case — the round stays
    // unset and a consultant picks it later.
    intakes.value = [];
  } finally {
    intakesLoading.value = false;
  }
}

watch(universityId, async (value, previous) => {
  // Changing school invalidates a round chosen at the old one — but only if
  // there *was* an old one. Deep links from `/admissions` and the school page
  // set the school and the round together, and this watcher's first flush sees
  // the school change from `''`; clearing there dropped the round out of every
  // such link and opened the case with no intake for the board to track.
  if (previous) intakeId.value = '';
  await loadIntakes(value);
});
watch(
  () => chosen.value,
  () => {
    if (universityId.value) void loadIntakes(universityId.value);
  },
);

const profile = computed(() => overview.value?.profile ?? null);
const openServices = computed(() => overview.value?.openServiceTypes ?? []);

const universityOptions = computed(() =>
  toUniversityOptions(catalogue.universities.value, 'Дараа шийдье / зөвлөхтэй ярина'));

const selected = computed(() => services.value.find((s) => s.serviceType === chosen.value) ?? null);
const selectedUniversity = computed(
  () => catalogue.universities.value.find((u) => u.id === universityId.value) ?? null,
);

/** Only the levels this service may target — GKS covers all four (§4.3). */
const eligibleIntakes = computed(() => {
  const service = chosen.value;
  if (!service) return intakes.value;
  if (service === 'GKS_SCHOLARSHIP') return intakes.value;
  return intakes.value.filter((intake) => intake.level === service);
});

const intakeOptions = computed(() => [
  { value: '', label: 'Дараа шийдье / зөвлөхтэй ярина' },
  ...eligibleIntakes.value.map((intake) => ({
    value: intake.id,
    label:
      `${intake.year} · ${INTAKE_MONTH_LABELS[intake.month] ?? `${intake.month}-р сар`}` +
      ` — ${PROGRAM_LEVEL_LABELS[intake.level]}` +
      (intake.internalDeadline ? ` (бүртгэл ${formatNumericDateUtc(intake.internalDeadline)} хүртэл)` : ''),
  })),
]);

const selectedIntake = computed(() => intakes.value.find((intake) => intake.id === intakeId.value) ?? null);

function isTaken(serviceType: ServiceType): boolean {
  return openServices.value.includes(serviceType);
}

function choose(option: ServiceOption) {
  if (!option.available || isTaken(option.serviceType)) return;
  chosen.value = option.serviceType;
  step.value = 2;
}

async function submit() {
  if (!chosen.value) return;
  errorMsg.value = null;
  submitting.value = true;
  try {
    const created = await api.post<PortalCaseDetail>('/me/cases', {
      serviceType: chosen.value,
      universityId: universityId.value || undefined,
      intakeId: intakeId.value || undefined,
      targetMajor: targetMajor.value.trim() || undefined,
    });
    await refresh();
    await navigateTo(`/app/cases/${created.id}/contract`);
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Үйлчилгээ эхлүүлж чадсангүй');
  } finally {
    submitting.value = false;
  }
}

const STEPS = ['Үйлчилгээ', 'Сургууль', 'Баталгаажуулах'];
</script>

<template>
  <div class="gks-start">
    <header>
      <span class="gks-eyebrow">Шинэ үйлчилгээ</span>
      <h1 class="gks-start__title">Зуучлалын гэрээгээ байгуулах</h1>
      <p class="gks-start__lede">
        Гурван алхам: үйлчилгээгээ сонгож, зорилтот сургуулиа зааж, гэрээгээ үүсгэнэ.
        Гэрээг цахимаар уншиж, имэйлээр ирэх кодоор баталгаажуулна.
      </p>
    </header>

    <ol class="gks-start__steps">
      <li
        v-for="(label, index) in STEPS"
        :key="label"
        class="gks-start__step"
        :class="{ 'gks-start__step--active': step === index + 1, 'gks-start__step--done': step > index + 1 }"
      >
        <span class="gks-start__step-no gks-tnum">{{ index + 1 }}</span>
        <span>{{ label }}</span>
      </li>
    </ol>

    <DsCard v-if="profile && !profile.isComplete" accent title="Эхлээд мэдээллээ гүйцээнэ үү">
      <p class="gks-start__note">
        Гэрээ таны нэр, регистрийн дугаар дээр бичигдэх тул профайл бүрэн байх шаардлагатай.
        Дутуу: {{ profile.missing.map((f) => f.label).join(', ') }}.
      </p>
      <DsButton variant="accent" icon-right="arrow-right" class="gks-start__cta" @click="navigateTo('/app/profile')">
        Мэдээллээ бөглөх
      </DsButton>
    </DsCard>

    <DsCard v-if="errorMsg && step === 1" accent><p class="gks-start__error">{{ errorMsg }}</p></DsCard>

    <!-- 1. Service -->
    <section v-if="step === 1" class="gks-start__services">
      <div v-if="loading" class="gks-start__skeleton" />
      <button
        v-for="option in services"
        v-else
        :key="option.serviceType"
        type="button"
        class="gks-start__service"
        :class="{ 'gks-start__service--disabled': !option.available || isTaken(option.serviceType) }"
        :disabled="!option.available || isTaken(option.serviceType)"
        @click="choose(option)"
      >
        <div class="gks-start__service-head">
          <span class="gks-start__service-name">{{ SERVICE_LABELS[option.serviceType] }}</span>
          <DsBadge v-if="isTaken(option.serviceType)" tone="info">Нээлттэй хэрэгтэй</DsBadge>
          <DsBadge v-else-if="!option.available" tone="neutral">Бэлтгэгдэж байна</DsBadge>
        </div>
        <p v-if="option.totalAmount" class="gks-start__price gks-tnum">
          {{ formatMntAmount(option.totalAmount) }}
        </p>
        <p v-if="option.prepaymentAmount !== null" class="gks-start__service-note gks-tnum">
          Урьдчилгаа {{ formatMnt(option.prepaymentAmount) }} ·
          үлдэгдэл {{ option.balanceTrigger ? BALANCE_TRIGGER_LABELS[option.balanceTrigger].toLowerCase() : '' }}
        </p>
      </button>
    </section>

    <!-- 2. Target school -->
    <DsCard v-else-if="step === 2" title="Зорилтот сургууль">
      <p class="gks-start__note">
        Одоо шийдээгүй бол хоосон орхиж болно — зөвлөх тантай хамт сонгоно. Сонголтоо дараа ч өөрчилж болно.
      </p>
      <div class="gks-start__fields">
        <DsCombobox
          v-model="universityId"
          label="Сургууль"
          :options="universityOptions"
          :loading="catalogue.loading.value"
        />
        <DsInput v-model="targetMajor" label="Зорьж буй мэргэжил" placeholder="Компьютерийн ухаан" />
        <DsSelect
          v-if="universityId"
          v-model="intakeId"
          label="Элсэлтийн улирал"
          :options="intakeOptions"
          :disabled="intakesLoading"
        />
      </div>
      <p v-if="universityId && !intakesLoading && !eligibleIntakes.length" class="gks-start__note">
        Энэ сургуулийн элсэлтийн хугацаа хараахан бүртгэгдээгүй байна. Зөвлөх тантай хамт тодруулна.
      </p>
      <div v-else-if="selectedIntake" class="gks-start__intake">
        <p>
          <strong>Бүртгэлийн эцсийн хугацаа:</strong>
          <span class="gks-tnum">{{ formatNumericDateUtc(selectedIntake.internalDeadline) }}</span>
          <span v-if="selectedIntake.daysUntilInternalDeadline !== null">
            ({{ deadlineCountdownLabel(selectedIntake.daysUntilInternalDeadline) }})
          </span>
        </p>
        <p>Хичээл эхлэх: <span class="gks-tnum">{{ formatNumericDateUtc(selectedIntake.classStartDate) }}</span></p>
        <p class="gks-start__intake-hint">
          Энэ огноо хүртэл материалаа бүрэн бүрдүүлсэн байх шаардлагатай.
        </p>
      </div>
      <footer class="gks-start__actions">
        <DsButton variant="secondary" icon-left="arrow-left" @click="step = 1">Буцах</DsButton>
        <DsButton variant="accent" icon-right="arrow-right" @click="step = 3">Үргэлжлүүлэх</DsButton>
      </footer>
    </DsCard>

    <!-- 3. Confirm -->
    <DsCard v-else title="Гэрээний нөхцөл">
      <dl class="gks-start__summary">
        <div><dt>Гэрээ байгуулагч</dt><dd>{{ profile?.fullName ?? '—' }}</dd></div>
        <div><dt>Үйлчилгээ</dt><dd>{{ selected ? SERVICE_LABELS[selected.serviceType] : '—' }}</dd></div>
        <div><dt>Сургууль</dt><dd>{{ universityName(selectedUniversity, 'Сонгоогүй') }}</dd></div>
        <div>
          <dt>Элсэлтийн улирал</dt>
          <dd>
            <template v-if="selectedIntake">
              {{ selectedIntake.year }} · {{ INTAKE_MONTH_LABELS[selectedIntake.month] ?? `${selectedIntake.month}-р сар` }}
              <span class="gks-tnum">(бүртгэл {{ formatNumericDateUtc(selectedIntake.internalDeadline) }} хүртэл)</span>
            </template>
            <template v-else>Сонгоогүй</template>
          </dd>
        </div>
        <div><dt>Мэргэжил</dt><dd>{{ targetMajor || 'Сонгоогүй' }}</dd></div>
        <div>
          <dt>Нийт төлбөр</dt>
          <dd class="gks-tnum">{{ selected?.totalAmount ? formatMntAmount(selected.totalAmount) : '—' }}</dd>
        </div>
        <div>
          <dt>Урьдчилгаа</dt>
          <dd class="gks-tnum">{{ selected?.prepaymentAmount !== null ? formatMnt(selected?.prepaymentAmount ?? null) : '—' }}</dd>
        </div>
        <div>
          <dt>Үлдэгдэл</dt>
          <dd class="gks-tnum">
            {{ formatMnt(selected?.balanceAmount ?? null) }}
            <span v-if="selected?.balanceTrigger">({{ BALANCE_TRIGGER_LABELS[selected.balanceTrigger].toLowerCase() }})</span>
          </dd>
        </div>
      </dl>

      <p class="gks-start__note">
        "Гэрээ үүсгэх" товч дарснаар гэрээ үүсэж, та түүнийг бүрэн эхээр нь уншина. Уншсаны дараа
        зөвшөөрч, бүртгэлийн имэйл хаяг руу тань ирэх 6 оронтой кодоор баталгаажуулснаар гэрээ
        хүчин төгөлдөр болно.
      </p>

      <p v-if="errorMsg" class="gks-start__error">{{ errorMsg }}</p>

      <footer class="gks-start__actions">
        <DsButton variant="secondary" icon-left="arrow-left" @click="step = 2">Буцах</DsButton>
        <DsButton
          variant="accent"
          icon-right="file-text"
          :disabled="!chosen || !profile?.isComplete"
          :loading="submitting"
          @click="submit"
        >
          Гэрээ үүсгэх
        </DsButton>
      </footer>
    </DsCard>
  </div>
</template>

<style scoped>
.gks-start { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-start__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-start__lede { margin-top: var(--sp-2); max-width: 66ch; font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }

.gks-start__steps { display: flex; flex-wrap: wrap; gap: var(--sp-3); list-style: none; }
.gks-start__step {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-4);
  border-radius: var(--radius-pill);
  border: var(--border-hair) solid var(--line-hairline);
  font-size: var(--fs-caption);
  color: var(--text-subtle);
  background: var(--surface-card);
}
.gks-start__step-no {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
}
.gks-start__step--active { border-color: var(--brand-500); color: var(--brand-700); font-weight: var(--fw-semibold); }
.gks-start__step--active .gks-start__step-no { background: var(--brand-600); color: var(--text-inverse); }
.gks-start__step--done { border-color: var(--success-line); background: var(--success-bg); color: var(--success-fg); }

.gks-start__services { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--sp-4); }
.gks-start__skeleton { grid-column: 1 / -1; height: 160px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }
.gks-start__service {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding: var(--sp-5);
  text-align: left;
  border-radius: var(--radius-3);
  border: var(--border-hair) solid var(--line-soft);
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
  cursor: pointer;
  transition: var(--transition-control);
}
.gks-start__service:hover:not(:disabled) { border-color: var(--brand-400); transform: translateY(-1px); }
.gks-start__service--disabled { opacity: .6; cursor: not-allowed; box-shadow: none; }
.gks-start__service-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
.gks-start__service-name { font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-start__price { font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-start__service-note { font-size: var(--fs-caption); color: var(--text-subtle); }

.gks-start__fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); margin-top: var(--sp-4); }
.gks-start__note { font-size: var(--fs-body-sm); color: var(--text-muted); line-height: var(--lh-body); }
.gks-start__intake { display: grid; gap: var(--sp-2); margin-top: var(--sp-4); padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--surface-sunken, var(--n-050)); font-size: var(--fs-body-sm); }
.gks-start__intake strong { color: var(--text-body); }
.gks-start__intake-hint { color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }
.gks-start__cta { margin-top: var(--sp-4); }

.gks-start__summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-5); }
.gks-start__summary dt { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-start__summary dd { margin-top: 2px; font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-strong); }

.gks-start__actions { display: flex; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-5); }
.gks-start__error {
  margin-top: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border: var(--border-hair) solid var(--danger-line);
  background: var(--danger-bg);
  color: var(--danger-fg);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
}

@media (max-width: 700px) {
  .gks-start__fields, .gks-start__summary { grid-template-columns: 1fr; }
}
</style>
