<script setup lang="ts">
import {
  buildRoadmap,
  formatDateRange,
  formatMonthYear,
  formatYearMonth,
  monthsUntil,
  nextIntakeDates,
  ROADMAP_RULES,
  ROADMAP_SERVICE_LABELS,
  ROADMAP_SERVICE_META,
  seasonLabel,
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
const roadmap = computed(() => buildRoadmap(service.value, targetDate.value, today));
const monthsLeft = computed(() => monthsUntil(today, targetDate.value));

const todayLabel = `${formatYearMonth(today)}.${String(today.getDate()).padStart(2, '0')}`;

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
    <!-- 1. What / when -->
    <div class="gks-plan__card gks-plan__picker">
      <div class="gks-plan__picker-main">
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
            <span class="gks-plan__choice-icon">
              <DsIcon :name="ROADMAP_SERVICE_META[item].icon" :size="20" />
            </span>
            <span class="gks-plan__choice-body">
              <span class="gks-plan__choice-title">{{ ROADMAP_SERVICE_LABELS[item] }}</span>
              <span class="gks-plan__choice-desc">{{ ROADMAP_SERVICE_META[item].description }}</span>
            </span>
          </button>
        </div>
      </div>

      <div class="gks-plan__picker-date">
        <h2 class="gks-plan__question">Хэзээ Солонгост очих вэ?</h2>
        <div class="gks-plan__datepicker">
          <DsIconButton
            icon="chevron-left"
            label="Өмнөх элсэлт"
            :disabled="intakeIndex === 0"
            @click="shiftIntake(-1)"
          />
          <div class="gks-plan__datepicker-value">
            <span class="gks-plan__datepicker-date gks-tnum">{{ formatMonthYear(targetDate) }}</span>
            <span v-if="seasonLabel(targetDate)" class="gks-plan__datepicker-season">
              {{ seasonLabel(targetDate) }}
            </span>
          </div>
          <DsIconButton
            icon="chevron-right"
            label="Дараагийн элсэлт"
            :disabled="intakeIndex === upcomingIntakes.length - 1"
            @click="shiftIntake(1)"
          />
        </div>
      </div>
    </div>

    <!-- 2. The path itself -->
    <div class="gks-plan__card gks-plan__path">
      <div class="gks-plan__path-head">
        <h2 class="gks-plan__path-title">
          Таны Солонгост сурах зам <span class="gks-plan__path-title-note">(жишээ төлөвлөгөө)</span>
        </h2>
        <span class="gks-plan__today gks-tnum">Өнөөдөр: {{ todayLabel }}</span>
      </div>

      <div class="gks-plan__track">
        <span class="gks-plan__now">Одоо</span>

        <ol class="gks-plan__steps">
          <li v-for="(step, i) in roadmap.steps" :key="step.key" class="gks-plan__step">
            <span class="gks-plan__step-marker">
              <span class="gks-plan__step-rail" :class="{ 'gks-plan__step-rail--last': i === roadmap.steps.length - 1 }" aria-hidden="true" />
              <span class="gks-plan__step-icon"><DsIcon :name="step.icon" :size="22" /></span>
              <span class="gks-plan__step-num gks-tnum">{{ i + 1 }}</span>
            </span>
            <h3 class="gks-plan__step-title">{{ step.title }}</h3>
            <p class="gks-plan__step-text">{{ step.text }}</p>
            <span class="gks-plan__step-range gks-tnum">{{ formatDateRange(step.start, step.end) }}</span>
          </li>
        </ol>

        <div class="gks-plan__destination">
          <span class="gks-plan__destination-icon"><DsIcon name="plane" :size="26" /></span>
          <h3 class="gks-plan__destination-title">Солонгос</h3>
          <span class="gks-plan__destination-date gks-tnum">{{ formatMonthYear(roadmap.destinationDate) }}</span>
          <span class="gks-plan__destination-sub">Хичээл эхэлнэ 🎉</span>
        </div>
      </div>

      <p class="gks-plan__ai-note">
        <DsIcon name="sparkles" :size="16" />
        Зөвлөх тань таны хэлний түвшин, төсөв, боловсролын мэдээлэлд үндэслэн энэ төлөвлөгөөг
        нарийвчилж, сар бүрийн хийх ажлыг сануулна.
      </p>
    </div>

    <!-- 3. Countdown → lead capture -->
    <div class="gks-plan__banner">
      <div>
        <h2 class="gks-plan__banner-title">
          Таны зорилгод <span class="gks-plan__banner-count gks-tnum">{{ monthsLeft }} сар</span> үлдлээ.
        </h2>
        <p class="gks-plan__banner-text">
          Одоо төлөвлөгөөгөө үүсгээд, хийх ёстой эхний алхмаа мэдээрэй.
        </p>
      </div>
      <DsButton variant="accent" size="lg" icon-right="arrow-right" @click="navigateTo(ctaHref)">
        Миний төлөвлөгөөг үүсгэх
      </DsButton>
    </div>
  </section>
</template>

<style scoped>
.gks-plan { display: flex; flex-direction: column; gap: var(--sp-5); scroll-margin-top: 88px; }

.gks-plan__card {
  padding: var(--sp-6);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-soft);
  border-radius: var(--radius-3);
  box-shadow: var(--shadow-card);
}

.gks-plan__question {
  font-size: var(--fs-body-lg);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  margin-bottom: var(--sp-4);
}

/* ---- Programme + intake picker ---- */
.gks-plan__picker { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--sp-6); }
.gks-plan__picker-date { padding-left: var(--sp-6); border-left: var(--border-hair) solid var(--line-soft); }

.gks-plan__choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
.gks-plan__choice {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-3);
  text-align: left;
  padding: var(--sp-4);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
  cursor: pointer;
  transition: var(--transition-control), box-shadow var(--dur-fast) var(--ease-standard);
}
.gks-plan__choice:hover { border-color: var(--brand-300); box-shadow: var(--shadow-raised); }
.gks-plan__choice--active {
  border-color: var(--brand-600);
  background: var(--brand-050);
  box-shadow: inset 0 0 0 1px var(--brand-600);
}
.gks-plan__choice-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-2);
  background: var(--brand-100);
  color: var(--brand-700);
}
.gks-plan__choice-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gks-plan__choice-title {
  font-family: var(--font-display);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.gks-plan__choice-desc { font-size: var(--fs-caption); color: var(--text-muted); line-height: 1.4; }

.gks-plan__datepicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-3);
  background: var(--surface-card);
  border: var(--border-hair) solid var(--line-hairline);
  border-radius: var(--radius-2);
}
.gks-plan__datepicker-value { display: flex; flex-direction: column; align-items: center; gap: 2px; min-width: 0; }
.gks-plan__datepicker-date {
  font-family: var(--font-display);
  font-size: var(--fs-h4);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  white-space: nowrap;
}
.gks-plan__datepicker-season { font-size: var(--fs-caption); color: var(--text-muted); }

/* ---- The path ---- */
.gks-plan__path-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-bottom: var(--sp-6);
}
.gks-plan__path-title { font-size: var(--fs-h4); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-plan__path-title-note { color: var(--brand-600); font-weight: var(--fw-medium); }
.gks-plan__today { font-size: var(--fs-caption); color: var(--text-subtle); white-space: nowrap; }

.gks-plan__track { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: var(--sp-3); }
.gks-plan__now {
  align-self: start;
  margin-top: 14px;
  padding: 3px var(--sp-3);
  background: var(--ink-800);
  color: var(--text-inverse);
  border-radius: var(--radius-pill);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  white-space: nowrap;
}

.gks-plan__steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-plan__step { display: flex; flex-direction: column; gap: var(--sp-1); min-width: 0; }
.gks-plan__step-marker { position: relative; display: block; height: 52px; margin-bottom: var(--sp-2); }
.gks-plan__step-rail {
  position: absolute;
  top: 26px;
  left: 52px;
  right: calc(-100% + 4px);
  height: 2px;
  background: var(--brand-200);
}
.gks-plan__step-rail--last { background: linear-gradient(90deg, var(--brand-200), var(--red-300)); }
.gks-plan__step-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--n-000);
  border: var(--border-thick) solid var(--brand-100);
  color: var(--brand-600);
}
.gks-plan__step-num {
  position: absolute;
  top: 34px;
  left: 38px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--brand-600);
  color: var(--text-inverse);
  font-size: var(--fs-micro);
  font-weight: var(--fw-bold);
  border: var(--border-thick) solid var(--n-000);
}
.gks-plan__step-title {
  font-family: var(--font-display);
  font-size: var(--fs-body-sm);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
}
.gks-plan__step-text { font-size: var(--fs-caption); color: var(--text-muted); line-height: 1.45; }
.gks-plan__step-range {
  margin-top: 2px;
  font-size: var(--fs-caption);
  font-weight: var(--fw-semibold);
  color: var(--brand-600);
}

.gks-plan__destination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 148px;
  padding: var(--sp-3);
  text-align: center;
}
.gks-plan__destination-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin-bottom: var(--sp-2);
  border-radius: 50%;
  background: var(--red-050);
  border: var(--border-thick) solid var(--red-100);
  color: var(--red-700);
}
.gks-plan__destination-title {
  font-size: var(--fs-body);
  font-weight: var(--fw-black);
  letter-spacing: var(--ls-caps-tight);
  text-transform: uppercase;
  color: var(--red-700);
}
.gks-plan__destination-date { font-size: var(--fs-caption); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-plan__destination-sub { font-size: var(--fs-caption); color: var(--text-muted); }

.gks-plan__ai-note {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-2);
  margin-top: var(--sp-6);
  padding: var(--sp-4);
  background: var(--brand-050);
  border-radius: var(--radius-2);
  font-size: var(--fs-body-sm);
  line-height: var(--lh-body);
  color: var(--brand-800);
}
.gks-plan__ai-note :deep(.gks-icon) { margin-top: 3px; color: var(--brand-600); }

/* ---- Countdown banner ---- */
.gks-plan__banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-5);
  padding: var(--sp-6) var(--sp-7);
  border-radius: var(--radius-3);
  background: linear-gradient(120deg, var(--brand-100) 0%, #e6f0ff 50%, #dbe9ff 100%);
  border: var(--border-hair) solid var(--brand-200);
}
.gks-plan__banner-title { font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-plan__banner-count { color: var(--brand-700); }
.gks-plan__banner-text { margin-top: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); }

@media (max-width: 1024px) {
  .gks-plan__picker { grid-template-columns: 1fr; }
  .gks-plan__picker-date { padding-left: 0; padding-top: var(--sp-5); border-left: 0; border-top: var(--border-hair) solid var(--line-soft); }
  .gks-plan__track { grid-template-columns: 1fr; }
  .gks-plan__now { justify-self: start; margin-top: 0; }
  .gks-plan__destination { flex-direction: row; align-items: center; gap: var(--sp-3); width: 100%; text-align: left; justify-self: start; }
  .gks-plan__destination-icon { margin-bottom: 0; }
}

@media (max-width: 768px) {
  .gks-plan__choices { grid-template-columns: 1fr; }
  .gks-plan__steps { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-5); }
  .gks-plan__step-rail { display: none; }
}

@media (max-width: 560px) {
  .gks-plan__card { padding: var(--sp-5) var(--sp-4); }
  .gks-plan__steps { grid-template-columns: 1fr; }
  .gks-plan__banner { padding: var(--sp-5); }
  .gks-plan__path-head { flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
}
</style>
