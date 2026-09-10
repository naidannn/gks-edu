<script setup lang="ts">
import type { DeparturePlan } from '@gks/shared';

/** 1F-09 — the pre-departure checklist, guides and flight details (§11). */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const caseId = computed(() => String(route.params.id));

const plan = ref<DeparturePlan | null>(null);
const pending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);

const flight = reactive({ departureAt: '', flightNo: '', pickupRequested: false });

const loadError = ref<string | null>(null);

async function load() {
  pending.value = true;
  loadError.value = null;
  try {
    plan.value = await api.get<DeparturePlan | null>(`/cases/${caseId.value}/departure`);
    if (plan.value) {
      // Not `slice(0, 16)`: the payload is UTC and the input is local, so
      // slicing and re-serialising moved the flight eight hours every save —
      // including a save that changed nothing, which then re-dated the whole
      // checklist from the wrong moment.
      flight.departureAt = toDatetimeLocal(plan.value.departureAt);
      flight.flightNo = plan.value.flightNo ?? '';
      flight.pickupRequested = plan.value.pickupRequested;
    }
  } catch (e) {
    loadError.value = apiErrorMessage(e, 'Явахын өмнөх бэлтгэлийг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);

async function toggle(itemId: string, isDone: boolean) {
  error.value = null;
  try {
    await api.patch(`/departure-items/${itemId}`, { isDone });
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Хадгалж чадсангүй');
  }
}

/** Saving the date re-dates every seeded item server-side (§11 offsets). */
async function saveFlight() {
  saving.value = true;
  error.value = null;
  try {
    await api.patch(`/cases/${caseId.value}/departure`, {
      departureAt: fromDatetimeLocal(flight.departureAt) ?? undefined,
      flightNo: flight.flightNo || undefined,
      pickupRequested: flight.pickupRequested,
    });
    await load();
  } catch (e) {
    error.value = apiErrorMessage(e, 'Хадгалж чадсангүй');
  } finally {
    saving.value = false;
  }
}

const pendingItems = computed(() => plan.value?.items.filter((item) => !item.isDone) ?? []);
const doneItems = computed(() => plan.value?.items.filter((item) => item.isDone) ?? []);
</script>

<template>
  <div class="gks-dep">
    <!-- A failed request is not an empty checklist: saying "виз гарсны дараа
         нээгдэнэ" for a 500 tells the client to wait for something that has
         already happened. -->
    <DsCard v-if="loadError" accent title="Явахын өмнөх бэлтгэл">
      <p class="gks-dep__error">{{ loadError }}</p>
      <DsButton size="sm" variant="secondary" icon-left="refresh-cw" @click="load">Дахин оролдох</DsButton>
    </DsCard>

    <DsCard v-else-if="!plan && !pending" title="Явахын өмнөх бэлтгэл">
      <p class="gks-dep__empty">Виз гарсны дараа явахын өмнөх бэлтгэлийн чеклист нээгдэнэ.</p>
    </DsCard>

    <template v-if="plan">
      <DsCard title="Нислэгийн мэдээлэл">
        <template #action>
          <span class="gks-dep__progress gks-tnum">{{ plan.progress.done }}/{{ plan.progress.total }} · {{ plan.progress.percent }}%</span>
        </template>

        <div class="gks-dep__flight">
          <DsInput v-model="flight.departureAt" type="datetime-local" label="Явах өдөр, цаг" hint="Хадгалахад чеклистийн хугацаанууд шинэчлэгдэнэ" />
          <DsInput v-model="flight.flightNo" label="Нислэгийн дугаар" placeholder="OM 501" />
          <DsCheckbox v-model="flight.pickupRequested" label="Сургуулийн тосох үйлчилгээ хүсэх" />
        </div>
        <DsButton size="sm" variant="accent" :loading="saving" @click="saveFlight">Хадгалах</DsButton>
        <p v-if="error" class="gks-dep__error">{{ error }}</p>
        <p v-if="plan.case.university" class="gks-dep__uni">
          <DsIcon name="map-pin" :size="14" /> {{ universityName(plan.case.university) }} · {{ plan.case.university.cityMn }}
        </p>
      </DsCard>

      <DsCard title="Хийх зүйлс">
        <ul class="gks-dep__list">
          <li v-for="item in pendingItems" :key="item.id" class="gks-dep__item">
            <DsCheckbox :model-value="item.isDone" :label="item.titleMn" :description="item.descriptionMn ?? undefined" @update:model-value="toggle(item.id, $event)" />
            <div class="gks-dep__item-meta">
              <span v-if="item.dueAt" class="gks-dep__due gks-tnum">{{ formatDayMonth(item.dueAt) }}</span>
              <a v-if="item.guideUrl" :href="item.guideUrl" target="_blank" rel="noopener" class="gks-dep__link">Гарын авлага</a>
              <a v-if="item.videoUrl" :href="item.videoUrl" target="_blank" rel="noopener" class="gks-dep__link">Видео</a>
            </div>
          </li>
        </ul>
        <p v-if="!pendingItems.length" class="gks-dep__done-all">
          <DsIcon name="check-check" :size="16" /> Бүх зүйл бэлэн боллоо. Сайн аялаарай!
        </p>
      </DsCard>

      <DsCard v-if="doneItems.length" title="Дууссан">
        <ul class="gks-dep__list gks-dep__list--done">
          <li v-for="item in doneItems" :key="item.id" class="gks-dep__item">
            <DsCheckbox :model-value="item.isDone" :label="item.titleMn" @update:model-value="toggle(item.id, $event)" />
          </li>
        </ul>
      </DsCard>

      <DsCard v-if="plan.emergencyNote || plan.dormitoryInfo" title="Санамж">
        <p v-if="plan.dormitoryInfo" class="gks-dep__note">{{ plan.dormitoryInfo }}</p>
        <p v-if="plan.emergencyNote" class="gks-dep__note">{{ plan.emergencyNote }}</p>
      </DsCard>
    </template>
  </div>
</template>

<style scoped>
.gks-dep { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-dep__empty { color: var(--text-subtle); font-style: italic; }
.gks-dep__progress { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-dep__flight { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--sp-4); margin-bottom: var(--sp-4); align-items: end; }
.gks-dep__error { margin-top: var(--sp-2); color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-dep__uni { margin-top: var(--sp-3); display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-caption); color: var(--text-muted); }

.gks-dep__list { display: flex; flex-direction: column; }
.gks-dep__item { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-2) 0; border-bottom: var(--border-hair) solid var(--line-hairline); }
.gks-dep__item:last-child { border-bottom: 0; }
.gks-dep__list--done { opacity: .6; }
.gks-dep__item-meta { display: flex; align-items: center; gap: var(--sp-3); flex: none; padding-top: var(--sp-3); }
.gks-dep__due { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-dep__link { font-size: var(--fs-caption); color: var(--brand-700); text-decoration: none; }
.gks-dep__link:hover { text-decoration: underline; }
.gks-dep__done-all { display: flex; align-items: center; gap: var(--sp-2); color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-dep__note { font-size: var(--fs-body-sm); color: var(--text-body); }
.gks-dep__note + .gks-dep__note { margin-top: var(--sp-2); }
</style>
