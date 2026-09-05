<script setup lang="ts">
import type { AdmissionListItem, PaginatedResult, ServiceType } from '@gks/shared';
import type { AdmissionStatus } from '~/utils/admissions';
import {
  formatAdmissionDate,
  getAdmissionCountdown,
  getAdmissionProgress,
  getAdmissionStatus,
} from '~/utils/admissions';

/**
 * The homepage's live intake countdown (1H-06).
 *
 * It reads real `IntakeTerm` rows and counts down to OUR deadline
 * (`internalDeadline`) — the only one a visitor is shown. The school's own,
 * later date stays on the staff screens: given both, people work to the later
 * one and arrive with unfinished documents.
 */
interface ActiveAdmission {
  id: string;
  slug: string;
  name: string;
  logo: string | null;
  city: string;
  degree: string;
  service: ServiceType;
  intake: string;
  /** When applications opened; the progress bar needs a start. */
  startAt: string;
  /** Our deadline — the only one shown, and what the countdown runs to. */
  deadline: string;
  classStartDate: string | null;
  quota: number | null;
  requirements: string[];
}

const LEVEL_SERVICE: Record<string, ServiceType> = {
  LANGUAGE_PREP: 'LANGUAGE_PREP',
  BACHELOR: 'BACHELOR',
  MASTER: 'MASTER',
  PHD: 'PHD',
};

/** How far back the progress bar starts when a school published no opening date. */
const ASSUMED_WINDOW_DAYS = 60;

const { data } = await useApiFetch<PaginatedResult<AdmissionListItem>>('/admissions', {
  query: { limit: 4, sort: 'deadline', order: 'asc' },
  key: 'home-active-admissions',
});

function toAdmission(row: AdmissionListItem): ActiveAdmission | null {
  // No deadline, nothing to count down to — such a round belongs on the
  // admissions page, not in a countdown block.
  const deadline = row.internalDeadline;
  if (!deadline) return null;

  const startAt =
    row.openAt ?? new Date(new Date(deadline).getTime() - ASSUMED_WINDOW_DAYS * DAY_IN_MS).toISOString();

  return {
    id: row.id,
    slug: row.university.slug,
    name: row.university.nameEn,
    logo: row.university.logoPath,
    city: row.university.cityMn,
    degree: PROGRAM_LEVEL_LABELS[row.level],
    service: LEVEL_SERVICE[row.level] ?? 'BACHELOR',
    intake: `${row.year} · ${INTAKE_MONTH_LABELS[row.month] ?? `${row.month}-р сар`}`,
    startAt,
    deadline,
    classStartDate: row.classStartDate,
    quota: row.quota,
    requirements: (row.requirementNote ?? '')
      .split(/[;\n]/)
      .map((line) => line.trim())
      .filter(Boolean),
  };
}

const admissions = computed<ActiveAdmission[]>(
  () => (data.value?.items ?? []).map((row) => toAdmission(row)).filter((row): row is ActiveAdmission => row !== null),
);

const STATUS_META: Record<AdmissionStatus, { label: string; shortLabel: string }> = {
  OPEN: { label: 'Элсэлт нээлттэй', shortLabel: 'Нээлттэй' },
  CLOSING_SOON: { label: 'Хугацаа ойртож байна', shortLabel: 'Удахгүй хаагдана' },
  URGENT: { label: 'ЯАРААРАЙ', shortLabel: 'Яараарай' },
};

const currentTime = useState('active-admissions-clock', () => Date.now());
const selectedAdmission = ref<ActiveAdmission | null>(null);
const drawerCloseButton = ref<HTMLButtonElement | null>(null);
let drawerOpener: HTMLElement | null = null;
let clock: ReturnType<typeof setInterval> | undefined;

const featuredAdmission = computed(() => admissions.value[0] ?? null);
const secondaryAdmissions = computed(() => admissions.value.slice(1));
const closingSoonCount = computed(
  () => admissions.value.filter((admission) => getStatus(admission) !== 'OPEN').length,
);

/** The nearest round, for the section intro — no more hard-coded "2027 spring". */
const introLine = computed(() => {
  const next = featuredAdmission.value;
  if (!next) return '';
  const days = getCountdown(next).days;
  return `Хамгийн ойрын элсэлт: ${next.name} — ${next.intake}. Бүртгэл хаагдахад ${days} хоног үлдлээ.`;
});

function getCountdown(admission: ActiveAdmission) {
  return getAdmissionCountdown(admission.deadline, currentTime.value);
}

function getStatus(admission: ActiveAdmission) {
  return getAdmissionStatus(getCountdown(admission).days);
}

function getProgress(admission: ActiveAdmission) {
  return getAdmissionProgress(admission.startAt, admission.deadline, currentTime.value);
}

function formatUnit(value: number) {
  return String(value).padStart(2, '0');
}

function openAdmission(admission: ActiveAdmission) {
  if (import.meta.client && document.activeElement instanceof HTMLElement) {
    drawerOpener = document.activeElement;
  }
  selectedAdmission.value = admission;
}

function closeAdmission() {
  selectedAdmission.value = null;
}

function startApplication(admission: ActiveAdmission) {
  closeAdmission();
  return navigateTo({
    path: '/consultation',
    query: { service: admission.service, university: admission.slug },
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeAdmission();
}

watch(selectedAdmission, (admission) => {
  if (!import.meta.client) return;
  document.body.style.overflow = admission ? 'hidden' : '';
  nextTick(() => {
    if (admission) drawerCloseButton.value?.focus();
    else drawerOpener?.focus();
  });
});

onMounted(() => {
  currentTime.value = Date.now();
  clock = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  if (clock) clearInterval(clock);
  window.removeEventListener('keydown', handleKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <section v-if="featuredAdmission" class="gks-admissions" aria-labelledby="active-admissions-title">
    <div class="gks-admissions__head">
      <div>
        <p class="gks-admissions__eyebrow"><span aria-hidden="true">🔥</span> Одоо элсэлт явагдаж байна</p>
        <h2 id="active-admissions-title" class="gks-admissions__title">Одоо элсэлт авч буй их сургуулиуд</h2>
        <p class="gks-admissions__intro">{{ introLine }}</p>
      </div>
      <div v-if="closingSoonCount" class="gks-admissions__alert">
        <DsIcon name="bell-ring" :size="18" />
        <span><strong class="gks-tnum">{{ closingSoonCount }}</strong> сургууль удахгүй хаагдана</span>
      </div>
    </div>

    <article
      class="gks-admission-featured"
      :class="`gks-admission--${getStatus(featuredAdmission).toLowerCase()}`"
    >
      <div class="gks-admission-featured__identity">
        <img
          v-if="featuredAdmission.logo"
          :src="featuredAdmission.logo"
          :alt="`${featuredAdmission.name} лого`"
          width="92"
          height="92"
        >
        <span v-else class="gks-admission__logo-placeholder" aria-hidden="true">
          <DsIcon name="landmark" :size="28" />
        </span>
        <div>
          <h3>{{ featuredAdmission.name }}</h3>
          <div class="gks-admission__tags">
            <span><DsIcon name="map-pin" :size="13" /> {{ featuredAdmission.city }}</span>
            <span>{{ featuredAdmission.degree }}</span>
            <span>{{ featuredAdmission.intake }}</span>
          </div>
          <p class="gks-admission__dates">
            <DsIcon name="calendar-days" :size="17" />
            <span>
              Бүртгэл хүлээн авах хугацаа
              <strong class="gks-tnum">{{ formatAdmissionDate(featuredAdmission.startAt) }} — {{ formatAdmissionDate(featuredAdmission.deadline) }}</strong>
            </span>
          </p>
        </div>
      </div>

      <div class="gks-admission-featured__timing">
        <p class="gks-admission-featured__countdown-label">Элсэлт хаагдахад</p>
        <div class="gks-countdown" aria-label="Элсэлт хаагдах хүртэлх хугацаа">
          <div
            v-for="unit in [
              { value: getCountdown(featuredAdmission).days, label: 'ӨДӨР' },
              { value: getCountdown(featuredAdmission).hours, label: 'ЦАГ' },
              { value: getCountdown(featuredAdmission).minutes, label: 'МИН' },
              { value: getCountdown(featuredAdmission).seconds, label: 'СЕК' },
            ]"
            :key="unit.label"
            class="gks-countdown__unit"
          >
            <strong class="gks-tnum">{{ formatUnit(unit.value) }}</strong>
            <span>{{ unit.label }}</span>
          </div>
        </div>

        <div class="gks-deadline-progress">
          <div class="gks-deadline-progress__labels">
            <span>Хугацааны явц</span>
            <strong class="gks-tnum">{{ getCountdown(featuredAdmission).days }} хоног үлдлээ</strong>
          </div>
          <div
            class="gks-deadline-progress__track"
            role="progressbar"
            aria-label="Материал хүлээн авах хугацааны явц"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(getProgress(featuredAdmission))"
          >
            <span class="gks-deadline-progress__fill" :style="{ width: `${getProgress(featuredAdmission)}%` }" />
            <span class="gks-deadline-progress__marker" :style="{ left: `${getProgress(featuredAdmission)}%` }" />
          </div>
          <div class="gks-deadline-progress__range gks-tnum">
            <span>{{ formatAdmissionDate(featuredAdmission.startAt) }}<small>Нээгдсэн</small></span>
            <span class="gks-deadline-progress__today" :style="{ left: `${getProgress(featuredAdmission)}%` }">Өнөөдөр</span>
            <span>{{ formatAdmissionDate(featuredAdmission.deadline) }}<small>Хаагдана</small></span>
          </div>
        </div>
      </div>

      <aside class="gks-admission-featured__action">
        <span class="gks-admission__status">
          <i /> {{ STATUS_META[getStatus(featuredAdmission)].label }}
        </span>
        <div class="gks-admission__signal">
          <p><DsIcon name="users" :size="17" /> Өндөр өрсөлдөөнтэй</p>
        </div>
        <button type="button" class="gks-admission__primary" @click="startApplication(featuredAdmission)">
          Элсэх боломжоо шалгах <DsIcon name="arrow-right" :size="17" />
        </button>
        <button type="button" class="gks-admission__secondary" @click="openAdmission(featuredAdmission)">
          Шаардлага харах
        </button>
      </aside>
    </article>

    <ul class="gks-admission-list">
      <li v-for="admission in secondaryAdmissions" :key="admission.id">
        <article class="gks-admission-card" :class="`gks-admission--${getStatus(admission).toLowerCase()}`">
          <div class="gks-admission-card__head">
            <img v-if="admission.logo" :src="admission.logo" :alt="`${admission.name} лого`" width="52" height="52">
            <span v-else class="gks-admission__logo-placeholder" aria-hidden="true">
              <DsIcon name="landmark" :size="22" />
            </span>
            <div>
              <h3>{{ admission.name }}</h3>
              <p>{{ admission.degree }} <span>·</span> {{ admission.intake }}</p>
            </div>
            <span class="gks-admission__status"><i /> {{ getCountdown(admission).days }} хоног үлдлээ</span>
          </div>
          <p class="gks-admission-card__date-label">Бүртгэл хүлээн авах хугацаа</p>
          <p class="gks-admission-card__dates gks-tnum">
            {{ formatAdmissionDate(admission.startAt) }} — {{ formatAdmissionDate(admission.deadline) }}
          </p>
          <div
            class="gks-admission-card__progress"
            role="progressbar"
            aria-label="Материал хүлээн авах хугацааны явц"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="Math.round(getProgress(admission))"
          >
            <span :style="{ width: `${getProgress(admission)}%` }" />
          </div>
          <div class="gks-admission-card__footer">
            <button type="button" @click="openAdmission(admission)">
              Элсэлтийн мэдээлэл <DsIcon name="arrow-right" :size="15" />
            </button>
          </div>
        </article>
      </li>
    </ul>

    <Teleport to="body">
      <Transition name="gks-admission-drawer">
        <div v-if="selectedAdmission" class="gks-admission-drawer" @mousedown.self="closeAdmission">
          <aside
            role="dialog"
            aria-modal="true"
            :aria-labelledby="`admission-${selectedAdmission.id}-title`"
            class="gks-admission-drawer__panel"
          >
            <button
              ref="drawerCloseButton"
              type="button"
              class="gks-admission-drawer__close"
              aria-label="Хаах"
              @click="closeAdmission"
            >
              <DsIcon name="x" :size="20" />
            </button>
            <div class="gks-admission-drawer__university">
              <img v-if="selectedAdmission.logo" :src="selectedAdmission.logo" :alt="`${selectedAdmission.name} лого`" width="64" height="64">
              <span v-else class="gks-admission__logo-placeholder" aria-hidden="true">
                <DsIcon name="landmark" :size="26" />
              </span>
              <div>
                <p>{{ selectedAdmission.intake }} · {{ selectedAdmission.degree }}</p>
                <h2 :id="`admission-${selectedAdmission.id}-title`">{{ selectedAdmission.name }}</h2>
              </div>
            </div>
            <div class="gks-admission-drawer__remaining" :class="`gks-admission--${getStatus(selectedAdmission).toLowerCase()}`">
              <DsIcon name="timer" :size="20" />
              <strong class="gks-tnum">
                {{ getCountdown(selectedAdmission).days }} өдөр {{ getCountdown(selectedAdmission).hours }} цаг үлдсэн
              </strong>
            </div>
            <div class="gks-admission-drawer__section">
              <h3>Хугацаа</h3>
              <dl class="gks-admission-drawer__dates">
                <div>
                  <dt>Бүртгэлийн эцсийн хугацаа</dt>
                  <dd class="gks-tnum">{{ formatAdmissionDate(selectedAdmission.deadline) }}</dd>
                </div>
                <div v-if="selectedAdmission.classStartDate">
                  <dt>Хичээл эхлэх</dt>
                  <dd class="gks-tnum">{{ formatAdmissionDate(selectedAdmission.classStartDate) }}</dd>
                </div>
                <div v-if="selectedAdmission.quota !== null">
                  <dt>Авах хүний тоо</dt>
                  <dd class="gks-tnum">{{ selectedAdmission.quota }}</dd>
                </div>
              </dl>
              <p class="gks-admission-drawer__hint">
                Энэ хугацаа дуустал хэдийд ч бүртгүүлэх боломжтой. Материал бүрдүүлэх хугацаа
                шаардагддаг тул эрт эхлэх тусам сайн.
              </p>
            </div>
            <div v-if="selectedAdmission.requirements.length" class="gks-admission-drawer__section">
              <h3>Үндсэн шаардлага</h3>
              <ul>
                <li v-for="requirement in selectedAdmission.requirements" :key="requirement">
                  <DsIcon name="check" :size="17" /> {{ requirement }}
                </li>
              </ul>
            </div>
            <button type="button" class="gks-admission-drawer__cta" @click="startApplication(selectedAdmission)">
              Материалаа бэлдэж эхлэх <DsIcon name="arrow-right" :size="18" />
            </button>
            <NuxtLink :to="`/universities/${selectedAdmission.slug}`" class="gks-admission-drawer__link" @click="closeAdmission">
              Сургуулийн дэлгэрэнгүйг харах
            </NuxtLink>
          </aside>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.gks-admission-drawer__dates { display: grid; gap: var(--sp-3); }
.gks-admission-drawer__dates > div { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-4); }
.gks-admission-drawer__dates dt { color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-admission-drawer__dates dd { font-weight: var(--fw-semibold); }
.gks-admission-drawer__hint { margin-top: var(--sp-3); color: var(--text-subtle); font-size: var(--fs-caption); line-height: 1.6; }

.gks-admissions {
  padding: var(--sp-7);
  border: var(--border-hair) solid var(--brand-100);
  border-radius: var(--radius-4);
  background:
    radial-gradient(circle at 92% 4%, rgba(219, 234, 254, .85), transparent 26%),
    linear-gradient(145deg, #f8fbff 0%, #f2f7ff 100%);
}
.gks-admissions__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-6); margin-bottom: var(--sp-6); }
.gks-admissions__eyebrow { color: var(--red-700); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
.gks-admissions__title { margin-top: var(--sp-2); font-size: clamp(25px, 3vw, var(--fs-h1)); font-weight: var(--fw-bold); }
.gks-admissions__intro { max-width: 62ch; margin-top: var(--sp-2); color: var(--text-subtle); }
.gks-admissions__alert { display: flex; align-items: center; gap: var(--sp-3); flex: none; padding: var(--sp-3) var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: rgba(255, 255, 255, .7); color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-admissions__alert .gks-icon { color: var(--red-700); }
.gks-admissions__alert strong { color: var(--text-body); }

.gks-admission-featured { display: grid; grid-template-columns: minmax(260px, 1.1fr) minmax(340px, .95fr) 250px; gap: var(--sp-6); padding: var(--sp-5); border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); box-shadow: var(--shadow-card); --admission-fg: var(--green-700); --admission-bg: var(--green-050); --admission-line: var(--green-100); }
.gks-admission-featured__identity { display: flex; align-items: flex-start; gap: var(--sp-4); }
.gks-admission-featured__identity > img { flex: none; width: 92px; height: 92px; padding: var(--sp-2); object-fit: contain; border: 1px solid var(--line-soft); border-radius: var(--radius-2); }
.gks-admission-featured__identity > .gks-admission__logo-placeholder { flex: none; width: 92px; height: 92px; border-radius: var(--radius-2); }
.gks-admission-featured h3 { font-size: var(--fs-h4); font-weight: var(--fw-bold); }
.gks-admission__tags { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-admission__tags span { display: inline-flex; align-items: center; gap: 4px; color: var(--text-subtle); font-size: var(--fs-caption); }
.gks-admission__tags span + span::before { content: '·'; margin-right: var(--sp-2); color: var(--n-300); }
.gks-admission__dates { display: flex; gap: var(--sp-2); margin-top: var(--sp-5); color: var(--text-muted); font-size: var(--fs-caption); line-height: 1.5; }
.gks-admission__dates > .gks-icon { margin-top: 2px; color: var(--text-subtle); }
.gks-admission__dates strong { display: block; color: var(--text-body); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); }
.gks-admission-featured__timing { padding: 0 var(--sp-6); border-inline: 1px solid var(--line-soft); }
.gks-admission-featured__countdown-label { color: var(--text-subtle); text-align: center; font-size: var(--fs-caption); font-weight: var(--fw-medium); }
.gks-countdown { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); margin-top: var(--sp-3); }
.gks-countdown__unit { display: grid; place-items: center; min-width: 0; padding: var(--sp-2); border: 1px solid var(--line-soft); border-radius: var(--radius-2); background: var(--n-025); }
.gks-countdown__unit strong { color: var(--admission-fg); font-size: clamp(24px, 2.5vw, 34px); font-weight: var(--fw-bold); line-height: 1.1; }
.gks-countdown__unit span { color: var(--text-subtle); font-size: 10px; font-weight: var(--fw-medium); }
.gks-deadline-progress { margin-top: var(--sp-5); }
.gks-deadline-progress__labels, .gks-deadline-progress__range { display: flex; justify-content: space-between; gap: var(--sp-3); font-size: var(--fs-micro); }
.gks-deadline-progress__labels { margin-bottom: var(--sp-2); color: var(--text-muted); }
.gks-deadline-progress__labels strong { color: var(--text-body); font-weight: var(--fw-medium); }
.gks-deadline-progress__track { position: relative; height: 6px; border-radius: var(--radius-pill); background: var(--n-200); }
.gks-deadline-progress__fill { display: block; height: 100%; border-radius: inherit; background: var(--admission-fg); transition: width var(--dur-slow) var(--ease-out); }
.gks-deadline-progress__marker { position: absolute; top: 50%; width: 12px; height: 12px; border: 2px solid var(--surface-card); border-radius: 50%; background: var(--admission-fg); box-shadow: 0 0 0 1px var(--admission-fg); transform: translate(-50%, -50%); }
.gks-deadline-progress__range { position: relative; margin-top: var(--sp-2); color: var(--text-body); }
.gks-deadline-progress__range > span { display: grid; }
.gks-deadline-progress__range > span:last-child { text-align: right; }
.gks-deadline-progress__range small { color: var(--text-muted); }
.gks-deadline-progress__today { position: absolute; bottom: -18px; color: var(--admission-fg); font-size: 10px; transform: translateX(-50%); }
.gks-admission-featured__action { display: flex; flex-direction: column; gap: var(--sp-3); padding: var(--sp-4); border-radius: var(--radius-2); background: var(--admission-bg); }
.gks-admission__status { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; padding: 5px 9px; border: 1px solid var(--admission-line); border-radius: var(--radius-pill); background: var(--admission-bg); color: var(--admission-fg); font-size: var(--fs-micro); font-weight: var(--fw-semibold); }
.gks-admission__status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.gks-admission__signal { display: grid; gap: var(--sp-2); color: var(--text-muted); font-size: var(--fs-caption); }
.gks-admission__signal p { display: flex; align-items: center; gap: var(--sp-2); }
.gks-admission__primary, .gks-admission__secondary { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); min-height: 42px; padding: 0 var(--sp-3); border-radius: var(--radius-2); font-size: var(--fs-caption); font-weight: var(--fw-semibold); cursor: pointer; transition: var(--transition-control); }
.gks-admission__primary { margin-top: auto; border: 1px solid var(--brand-600); background: var(--brand-600); color: white; box-shadow: var(--shadow-brand); }
.gks-admission__primary:hover { border-color: var(--brand-700); background: var(--brand-700); }
.gks-admission__secondary { min-height: 34px; border: 0; background: transparent; color: var(--text-muted); font-weight: var(--fw-medium); }
.gks-admission__secondary:hover { background: rgba(255, 255, 255, .65); color: var(--brand-700); }

.gks-admission-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-4); margin: var(--sp-4) 0 0; padding: 0; list-style: none; }
.gks-admission-card { height: 100%; padding: var(--sp-4); border: 1px solid var(--line-soft); border-radius: var(--radius-3); background: var(--surface-card); box-shadow: var(--shadow-raised); --admission-fg: var(--green-700); --admission-bg: var(--green-050); --admission-line: var(--green-100); transition: border-color var(--dur-base), box-shadow var(--dur-base), transform var(--dur-base); }
.gks-admission-card:hover { border-color: var(--brand-200); box-shadow: var(--shadow-card); transform: translateY(-2px); }
.gks-admission-card__head { display: grid; grid-template-columns: 52px 1fr; align-items: center; gap: var(--sp-3); }
/* The countdown pill sits on its own row: schools are named in English, and
   "Korea Advanced Institute of Science and Technology (KAIST)" leaves nothing
   for the title if the pill competes with it for the same line. */
.gks-admission-card__head .gks-admission__status { grid-column: 1 / -1; justify-self: start; }
.gks-admission-card__head img { width: 52px; height: 52px; padding: 4px; object-fit: contain; border: 1px solid var(--line-soft); border-radius: 50%; }
.gks-admission__logo-placeholder { display: grid; place-items: center; width: 52px; height: 52px; border: 1px solid var(--brand-100); border-radius: 50%; background: var(--brand-050); color: var(--brand-600); }
.gks-admission-card__head h3 { font-size: var(--fs-body); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
.gks-admission-card__head p { margin-top: 2px; color: var(--text-muted); font-size: var(--fs-caption); }
.gks-admission-card__date-label { margin-top: var(--sp-5); color: var(--text-muted); font-size: var(--fs-micro); }
.gks-admission-card__dates { color: var(--text-body); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); }
.gks-admission-card__progress { height: 5px; margin-top: var(--sp-3); overflow: hidden; border-radius: var(--radius-pill); background: var(--n-200); }
.gks-admission-card__progress span { display: block; height: 100%; border-radius: inherit; background: var(--admission-fg); }
.gks-admission-card__footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-5); padding-top: var(--sp-3); border-top: 1px solid var(--line-soft); }
.gks-admission-card__footer button { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: none; color: var(--brand-600); font-size: var(--fs-caption); font-weight: var(--fw-medium); cursor: pointer; }
.gks-admission-card__footer button:hover { color: var(--brand-700); }

.gks-admission--closing_soon { --admission-fg: #c45d08; --admission-bg: #fff7ed; --admission-line: #fed7aa; }
.gks-admission--urgent { --admission-fg: var(--red-700); --admission-bg: var(--red-050); --admission-line: var(--red-100); }

.gks-admission-drawer { position: fixed; z-index: 1000; inset: 0; display: flex; justify-content: flex-end; background: var(--scrim); backdrop-filter: var(--blur-scrim); }
.gks-admission-drawer__panel { position: relative; width: min(460px, 100%); height: 100%; padding: var(--sp-7); overflow-y: auto; background: var(--surface-card); box-shadow: var(--shadow-dialog); }
.gks-admission-drawer__close { position: absolute; top: var(--sp-4); right: var(--sp-4); display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--line-hairline); border-radius: 50%; background: white; cursor: pointer; }
.gks-admission-drawer__close:hover { background: var(--surface-hover); }
.gks-admission-drawer__university { display: flex; align-items: center; gap: var(--sp-4); padding-right: var(--sp-7); }
.gks-admission-drawer__university img { width: 64px; height: 64px; padding: 5px; object-fit: contain; border: 1px solid var(--line-soft); border-radius: var(--radius-2); }
.gks-admission-drawer__university .gks-admission__logo-placeholder { width: 64px; height: 64px; border-radius: var(--radius-2); }
.gks-admission-drawer__university p { color: var(--brand-600); font-size: var(--fs-caption); font-weight: var(--fw-semibold); }
.gks-admission-drawer__university h2 { margin-top: 2px; font-size: var(--fs-h3); }
.gks-admission-drawer__remaining { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-6); padding: var(--sp-3) var(--sp-4); border: 1px solid var(--admission-line, var(--green-100)); border-radius: var(--radius-2); background: var(--admission-bg, var(--green-050)); color: var(--admission-fg, var(--green-700)); }
.gks-admission-drawer__section { margin-top: var(--sp-7); }
.gks-admission-drawer__section h3 { font-size: var(--fs-body); font-weight: var(--fw-bold); }
.gks-admission-drawer__section ul { display: grid; gap: var(--sp-3); margin: var(--sp-4) 0 0; padding: 0; list-style: none; }
.gks-admission-drawer__section li { display: flex; align-items: center; gap: var(--sp-3); color: var(--text-body); font-size: var(--fs-body-sm); }
.gks-admission-drawer__section li .gks-icon { display: grid; place-items: center; padding: 3px; border-radius: 50%; background: var(--green-050); color: var(--green-700); }
.gks-admission-drawer__section > p { margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-caption); }
.gks-admission-drawer__cta { display: flex; align-items: center; justify-content: center; gap: var(--sp-2); width: 100%; min-height: 50px; margin-top: var(--sp-8); border: 1px solid var(--brand-600); border-radius: var(--radius-2); background: var(--brand-600); color: white; font-weight: var(--fw-semibold); cursor: pointer; box-shadow: var(--shadow-brand); }
.gks-admission-drawer__cta:hover { background: var(--brand-700); }
.gks-admission-drawer__link { display: block; margin-top: var(--sp-4); color: var(--brand-600); text-align: center; font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); text-decoration: none; }
.gks-admission-drawer-enter-active, .gks-admission-drawer-leave-active { transition: opacity var(--dur-slow) var(--ease-standard); }
.gks-admission-drawer-enter-active .gks-admission-drawer__panel, .gks-admission-drawer-leave-active .gks-admission-drawer__panel { transition: transform var(--dur-slow) var(--ease-out); }
.gks-admission-drawer-enter-from, .gks-admission-drawer-leave-to { opacity: 0; }
.gks-admission-drawer-enter-from .gks-admission-drawer__panel, .gks-admission-drawer-leave-to .gks-admission-drawer__panel { transform: translateX(100%); }

@media (max-width: 1100px) {
  .gks-admission-featured { grid-template-columns: 1fr 1fr; }
  .gks-admission-featured__action { grid-column: 1 / -1; display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; }
  .gks-admission__primary { margin-top: 0; }
  .gks-admission-card__head { grid-template-columns: 48px 1fr; }
}

@media (max-width: 820px) {
  .gks-admissions { padding: var(--sp-5); }
  .gks-admissions__head { align-items: flex-start; flex-direction: column; }
  .gks-admission-featured { grid-template-columns: 1fr; }
  .gks-admission-featured__timing { padding: var(--sp-5) 0; border-inline: 0; border-block: 1px solid var(--line-soft); }
  .gks-admission-featured__action { grid-column: auto; display: flex; }
  .gks-admission-list { grid-template-columns: 1fr; }
  .gks-admission-card__head { grid-template-columns: 52px 1fr; }
}

@media (max-width: 540px) {
  .gks-admissions { margin-inline: calc(var(--gutter-mobile) * -1); padding: var(--sp-6) var(--gutter-mobile); border-inline: 0; border-radius: 0; }
  .gks-admissions__alert { width: 100%; }
  .gks-admission-featured { padding: var(--sp-4); }
  .gks-admission-featured__identity { flex-direction: column; }
  .gks-admission-featured__identity > img { width: 72px; height: 72px; }
  .gks-countdown { gap: 5px; }
  .gks-countdown__unit { padding: var(--sp-2) 2px; }
  .gks-countdown__unit strong { font-size: 24px; }
  .gks-admission-card__head { grid-template-columns: 48px 1fr; }
  .gks-admission-card__footer { align-items: flex-start; flex-direction: column; }
  .gks-admission-drawer__panel { padding: var(--sp-6) var(--sp-5); }
}

@media (prefers-reduced-motion: reduce) {
  .gks-admission-card:hover { transform: none; }
}
</style>
