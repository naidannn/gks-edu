<script setup lang="ts">
import {
  buildRoadmap,
  formatFullDate,
  formatMonthYear,
  nextIntakeDates,
  ROADMAP_RULES,
  ROADMAP_SERVICE_LABELS,
  ROADMAP_SERVICE_META,
  type RoadmapService,
} from '~/utils/roadmap';

const today = new Date();
const service = ref<RoadmapService>('LANGUAGE_PREP');
const intakeIndex = ref(0);

const services = Object.keys(ROADMAP_RULES) as RoadmapService[];
const upcomingIntakes = computed(() => nextIntakeDates(service.value, today, 3));
const targetDate = computed<Date>(
  () => upcomingIntakes.value[intakeIndex.value] ?? upcomingIntakes.value[0] ?? today,
);
const roadmap = computed(() => buildRoadmap(service.value, targetDate.value));
const detailedSteps = computed(() => [
  {
    icon: 'calendar-check',
    title: 'Бүртгэл',
    text: 'Хүсэлтээ баталгаажуулж, шаардлагатай материалаа бүрдүүлнэ.',
    date: formatFullDate(roadmap.value.registrationDeadline),
  },
  {
    icon: 'send',
    title: 'Сургуульд мэдүүлэх',
    text: 'Сонгосон сургууль руу элсэлтийн материалаа илгээнэ.',
  },
  {
    icon: 'stamp',
    title: 'Виз мэдүүлэх',
    text: 'Сургуулийн хариу, урилгыг авсны дараа визэнд мэдүүлнэ.',
  },
  {
    icon: 'plane',
    title: 'Солонгос явах',
    text: 'Хичээл эхлэхээс өмнө Солонгос улсад очно.',
    date: formatFullDate(roadmap.value.destinationDate),
  },
]);

function selectService(next: RoadmapService) {
  service.value = next;
  intakeIndex.value = 0;
}

function shiftIntake(delta: number) {
  const max = upcomingIntakes.value.length - 1;
  intakeIndex.value = Math.min(max, Math.max(0, intakeIndex.value + delta));
}

const ctaHref = computed(() => {
  const label = ROADMAP_SERVICE_LABELS[service.value];
  const note = `Төлөвлөгөөнөөс үүссэн хүсэлт: ${label}, ${formatMonthYear(targetDate.value)}-д Солонгост очих зорилготой.`;
  const params = new URLSearchParams({ service: service.value, note });
  return `/consultation?${params.toString()}`;
});
</script>

<template>
  <section id="planner" class="gks-plan">
    <div class="gks-plan__top">
      <h2 class="gks-plan__question">Та ямар хөтөлбөр сонирхож байна?</h2>
      <div class="gks-plan__choices" role="group" aria-label="Хөтөлбөр сонгох">
        <button
          v-for="item in services"
          :key="item"
          type="button"
          class="gks-plan__choice"
          :class="{ 'gks-plan__choice--active': item === service }"
          :aria-pressed="item === service"
          @click="selectService(item)"
        >
          <DsIcon :name="ROADMAP_SERVICE_META[item].icon" :size="19" />
          <span>{{ ROADMAP_SERVICE_LABELS[item] }}</span>
        </button>
      </div>
    </div>

    <div class="gks-plan__heading">
      <h3 class="gks-plan__title">Таны Солонгост сурах зам</h3>
      <div class="gks-plan__intake-controls" aria-label="Элсэлтийн улирал сонгох">
        <DsIconButton
          icon="chevron-left"
          label="Өмнөх элсэлт"
          size="sm"
          variant="outline"
          :disabled="intakeIndex === 0"
          @click="shiftIntake(-1)"
        />
        <DsIconButton
          icon="chevron-right"
          label="Дараагийн элсэлт"
          size="sm"
          variant="outline"
          :disabled="intakeIndex === upcomingIntakes.length - 1"
          @click="shiftIntake(1)"
        />
      </div>
    </div>

    <div class="gks-plan__dates">
      <article class="gks-plan__date-card">
        <span class="gks-plan__date-icon"><DsIcon name="calendar-check" :size="24" /></span>
        <div>
          <p class="gks-plan__date-label">Бүртгүүлэх огноо</p>
          <p class="gks-plan__date gks-tnum">{{ formatFullDate(roadmap.registrationDeadline) }}</p>
        </div>
      </article>

      <div
        class="gks-plan__route"
        :aria-label="`Бүртгэлээс Солонгос улсад очих хүртэл ${roadmap.durationDays} хоног`"
      >
        <span class="gks-plan__route-duration gks-tnum">
          <strong>{{ roadmap.durationDays }}</strong>
          <span>хоног</span>
        </span>
        <span class="gks-plan__route-arrow" aria-hidden="true">
          <DsIcon name="arrow-right" :size="17" />
        </span>
      </div>

      <article class="gks-plan__date-card gks-plan__date-card--arrival">
        <span class="gks-plan__date-icon"><DsIcon name="plane" :size="24" /></span>
        <div>
          <p class="gks-plan__date-label">Солонгос улсад очих огноо</p>
          <p class="gks-plan__date gks-tnum">{{ formatFullDate(roadmap.destinationDate) }}</p>
        </div>
      </article>
    </div>

    <details class="gks-plan__details">
      <summary>
        <span>Дэлгэрэнгүй харах</span>
        <DsIcon name="chevron-down" :size="18" />
      </summary>

      <ol class="gks-plan__detail-list">
        <li v-for="(step, index) in detailedSteps" :key="step.title" class="gks-plan__detail-step">
          <span class="gks-plan__detail-marker">
            <DsIcon :name="step.icon" :size="18" />
            <span class="gks-tnum">{{ index + 1 }}</span>
          </span>
          <div>
            <h4>{{ step.title }}</h4>
            <p>{{ step.text }}</p>
            <time v-if="step.date" class="gks-tnum">{{ step.date }}</time>
          </div>
        </li>
      </ol>
    </details>

    <div class="gks-plan__action">
      <DsButton variant="accent" icon-right="arrow-right" @click="navigateTo(ctaHref)">
        Үнэгүй зөвлөгөө авах
      </DsButton>
    </div>
  </section>
</template>

<style scoped>
.gks-plan {
  display: grid;
  gap: var(--sp-5);
  padding: var(--sp-6);
  scroll-margin-top: 88px;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-card);
}

.gks-plan__top {
  display: grid;
  grid-template-columns: minmax(240px, .72fr) minmax(0, 1.28fr);
  align-items: center;
  gap: var(--sp-6);
}

.gks-plan__question,
.gks-plan__title {
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
}

.gks-plan__choices {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-2);
}

.gks-plan__choice {
  display: flex;
  min-height: var(--control-lg);
  align-items: center;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-2) var(--sp-3);
  color: var(--text-muted);
  text-align: center;
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  cursor: pointer;
  transition: var(--transition-control), box-shadow var(--dur-fast) var(--ease-standard);
}

.gks-plan__choice:hover { color: var(--brand-700); border-color: var(--brand-300); }
.gks-plan__choice--active {
  color: var(--brand-700);
  font-weight: var(--fw-semibold);
  background: var(--brand-050);
  border-color: var(--brand-600);
  box-shadow: inset 0 0 0 1px var(--brand-600);
}

.gks-plan__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding-top: var(--sp-5);
  border-top: var(--border-hair) solid var(--line-soft);
}

.gks-plan__intake-controls { display: flex; gap: var(--sp-2); }
.gks-plan__dates {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 132px minmax(0, 1fr);
  align-items: stretch;
  gap: 0;
}

.gks-plan__date-card {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  min-width: 0;
  padding: var(--sp-5);
  background: var(--brand-025);
  border: var(--border-hair) solid var(--brand-100);
  border-radius: var(--radius-2);
}

.gks-plan__date-card--arrival { background: var(--surface-sunken); border-color: var(--line-soft); }
.gks-plan__date-icon {
  display: grid;
  flex: none;
  width: 48px;
  height: 48px;
  place-items: center;
  color: var(--brand-700);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--brand-100);
  border-radius: 50%;
}

.gks-plan__date-label {
  margin-bottom: var(--sp-1);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps-tight);
  color: var(--text-muted);
  text-transform: uppercase;
}

.gks-plan__date {
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  line-height: var(--lh-snug);
  color: var(--text-strong);
}

.gks-plan__route {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.gks-plan__route::before {
  position: absolute;
  right: 0;
  left: 0;
  border-top: 2px dashed var(--brand-300);
  content: '';
}

.gks-plan__route-duration {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding: 5px var(--sp-2);
  color: var(--brand-700);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--brand-200);
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-raised);
  white-space: nowrap;
}

.gks-plan__route-duration strong { font-size: var(--fs-body-sm); }
.gks-plan__route-duration span { font-size: var(--fs-micro); font-weight: var(--fw-semibold); }
.gks-plan__route-arrow {
  position: absolute;
  right: -1px;
  z-index: 2;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--text-inverse);
  background: var(--brand-600);
  border: 3px solid var(--surface-card);
  border-radius: 50%;
}

.gks-plan__details {
  border-top: var(--border-hair) solid var(--line-soft);
  border-bottom: var(--border-hair) solid var(--line-soft);
}

.gks-plan__details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  color: var(--brand-700);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  list-style: none;
}

.gks-plan__details summary::-webkit-details-marker { display: none; }
.gks-plan__details summary :deep(.gks-icon) { transition: transform var(--dur-base) var(--ease-standard); }
.gks-plan__details[open] summary :deep(.gks-icon) { transform: rotate(180deg); }

.gks-plan__detail-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-4);
  margin: 0;
  padding: var(--sp-2) 0 var(--sp-5);
  list-style: none;
}

.gks-plan__detail-step {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  min-width: 0;
  padding-top: var(--sp-4);
  border-top: 2px solid var(--brand-200);
}

.gks-plan__detail-marker {
  display: grid;
  flex: none;
  width: 36px;
  height: 36px;
  place-items: center;
  color: var(--brand-700);
  background: var(--brand-050);
  border-radius: 50%;
}

.gks-plan__detail-marker > span {
  position: absolute;
  top: 7px;
  left: 25px;
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  color: var(--text-inverse);
  background: var(--brand-600);
  border: 2px solid var(--surface-card);
  border-radius: 50%;
  font-size: 9px;
  font-weight: var(--fw-bold);
}

.gks-plan__detail-step h4 { font-size: var(--fs-body-sm); }
.gks-plan__detail-step p { margin-top: 2px; color: var(--text-muted); font-size: var(--fs-caption); line-height: 1.45; }
.gks-plan__detail-step time { display: block; margin-top: var(--sp-1); color: var(--brand-700); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
.gks-plan__action { display: flex; justify-content: flex-end; }

@media (max-width: 820px) {
  .gks-plan__top { grid-template-columns: 1fr; gap: var(--sp-3); }
  .gks-plan__detail-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 620px) {
  .gks-plan { gap: var(--sp-4); padding: var(--sp-4); }
  .gks-plan__choices { gap: var(--sp-1); }
  .gks-plan__choice { flex-direction: column; min-height: 72px; gap: var(--sp-1); padding: var(--sp-2); font-size: var(--fs-micro); line-height: var(--lh-snug); }
  .gks-plan__heading { padding-top: var(--sp-4); }
  .gks-plan__title { font-size: var(--fs-body); }
  .gks-plan__dates { grid-template-columns: 1fr; }
  .gks-plan__date-card { gap: var(--sp-3); padding: var(--sp-3); }
  .gks-plan__date-icon { width: 42px; height: 42px; }
  .gks-plan__date { font-size: var(--fs-body); }
  .gks-plan__route { min-height: 58px; justify-content: flex-start; padding-left: 66px; }
  .gks-plan__route::before { top: 0; bottom: 0; right: auto; left: 32px; border-top: 0; border-left: 2px dashed var(--brand-300); }
  .gks-plan__route-arrow { right: auto; bottom: -1px; left: 20px; transform: rotate(90deg); }
  .gks-plan__detail-list { grid-template-columns: 1fr; gap: var(--sp-3); }
  .gks-plan__detail-step { padding-top: var(--sp-3); }
  .gks-plan__action :deep(.gks-button) { width: 100%; }
}
</style>
