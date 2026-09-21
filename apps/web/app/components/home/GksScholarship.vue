<script setup lang="ts">
import type { GksRound, GksRoundDegree } from '~/utils/gks-rounds';
import {
  GKS_AGE_LIMIT,
  GKS_GPA_FLOOR,
  GKS_ROUNDS,
  featuredGksRound,
  getGksRoundPhase,
  gksDaysUntil,
  gksQuickVerdict,
  gksRoundHeadline,
  sortGksRounds,
} from '~/utils/gks-rounds';

/**
 * The home page's GKS block: what the scholarship pays for, which round is
 * taking applications right now (with its clock), and a two-slider first
 * answer to "would I even qualify?" — the question that stops most people
 * before they ask us anything.
 */
const now = useNow('home-gks-clock');

const DEGREES: { value: GksRoundDegree; label: string }[] = [
  { value: 'BACHELOR', label: 'Бакалавр' },
  { value: 'GRADUATE', label: 'Магистр · Доктор' },
];

// Opens on whichever degree is live, so the first thing seen is a running clock.
const degree = ref<GksRoundDegree>(featuredGksRound(GKS_ROUNDS, now.value)?.degree ?? 'BACHELOR');

// One round per degree today; sorted anyway, so a second one lands in the right
// place the year NIIED splits a level into rounds again.
const lead = computed<GksRound | null>(
  () =>
    sortGksRounds(
      GKS_ROUNDS.filter((round) => round.degree === degree.value),
      now.value,
    )[0] ?? null,
);
const leadPhase = computed(() => (lead.value ? getGksRoundPhase(lead.value, now.value) : null));
const liveCount = computed(() => GKS_ROUNDS.filter((round) => getGksRoundPhase(round, now.value) === 'OPEN').length);

/**
 * The stipend is paid in won, but a visitor weighs it against a salary in
 * tögrög — so the card shows tögrög. The rate is a rounded snapshot, not a
 * feed: move it when the won drifts far enough to change the first digit.
 */
const STIPEND_KRW = 1_200_000;
const MNT_PER_KRW = 2.45;
const stipendMnt = `≈${(Math.round((STIPEND_KRW * MNT_PER_KRW) / 100_000) / 10).toString()} сая ₮`;

const BENEFITS = [
  { icon: 'graduation-cap', value: '100%', label: 'сургалтын төлбөр' },
  { icon: 'wallet-cards', value: stipendMnt, label: 'сар бүрийн тэтгэмж' },
  { icon: 'plane', value: '2 талдаа', label: 'онгоцны тийз' },
  { icon: 'languages', value: '1 жил', label: 'хэлний бэлтгэл' },
];

// ── The quick check ────────────────────────────────────────────────────────
const age = ref(18);
const gpa = ref(85);
const touched = ref(false);

watch(degree, (next) => {
  // Keep the slider inside a plausible range for the degree just picked.
  if (next === 'GRADUATE' && age.value < 21) age.value = 24;
  if (next === 'BACHELOR' && age.value > 24) age.value = 18;
});

const verdict = computed(() => gksQuickVerdict(degree.value, age.value, gpa.value));

const VERDICT_COPY = computed(() => {
  const limit = GKS_AGE_LIMIT[degree.value];
  return {
    OK: {
      title: 'Суурь шалгуурыг хангаж байна',
      text: 'Нас, голч тань тохирч байна. Одоо сонгон шалгаруулалтад юу нөлөөлөхийг 1 минутад харна уу.',
    },
    AGE: {
      title: `Насны хязгаар: ${limit} хүрээгүй`,
      text: 'GKS-ийн энэ түвшинд насны хатуу хязгаартай. Өөр зам, өөр тэтгэлгийг зөвлөхтэйгөө ярилцъя.',
    },
    GPA: {
      title: `Голч ${GKS_GPA_FLOOR}%-иас дээш байх ёстой`,
      text: 'Ангийнхаа эхний 20%-д багтдаг бол бас тэнцэнэ. Бусад замаар бүрэн шалгаж өгье.',
    },
    BOTH: {
      title: 'Нас, голч хоёулаа хязгаараас гарч байна',
      text: 'GKS биш ч гэсэн Солонгост сурах төлбөртэй, хэлний бэлтгэлийн зам нээлттэй.',
    },
  }[verdict.value];
});
</script>

<template>
  <section class="home-gks" aria-labelledby="home-gks-title">
    <div class="home-gks__head">
      <div>
        <p class="home-gks__kicker">
          <span v-if="liveCount" class="home-gks__live"><i aria-hidden="true" /> LIVE</span>
          БНСУ-ЫН ЗАСГИЙН ГАЗРЫН ТЭТГЭЛЭГ · GKS
        </p>
        <h2 id="home-gks-title">Солонгост <span>үнэ төлбөргүй</span> сур.</h2>
        <p class="home-gks__lede">
          Сургалтын төлбөр, сар бүрийн тэтгэмж, онгоцны тийз, нэг жилийн хэлний бэлтгэлийг
          Солонгосын Засгийн газар даана. GKS EDU 50+ оюутныг тэнцүүлсэн.
        </p>
      </div>
      <ul class="home-gks__benefits">
        <li v-for="benefit in BENEFITS" :key="benefit.label">
          <DsIcon :name="benefit.icon" :size="18" />
          <strong>{{ benefit.value }}</strong>
          <span>{{ benefit.label }}</span>
        </li>
      </ul>
    </div>

    <div class="home-gks__body">
      <!-- ── Round status, per degree ─────────────────────────────────── -->
      <div class="home-gks__rounds">
        <div class="home-gks__tabs" role="tablist" aria-label="Боловсролын түвшин">
          <button
            v-for="option in DEGREES"
            :key="option.value"
            type="button"
            role="tab"
            :aria-selected="degree === option.value"
            :class="{ 'is-active': degree === option.value }"
            @click="degree = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="lead" class="home-gks__lead" :class="`is-${leadPhase?.toLowerCase()}`" role="tabpanel">
          <p class="home-gks__pill"><i aria-hidden="true" /> {{ gksRoundHeadline(lead, now) }}</p>
          <h3>{{ lead.track }}</h3>
          <p class="home-gks__window gks-tnum">
            <DsIcon name="calendar-clock" :size="16" /> {{ lead.window }}
          </p>

          <template v-if="leadPhase === 'OPEN' && lead.countdown">
            <p class="home-gks__label">Бүртгэл хаагдахад</p>
            <GksCountdown :to="lead.closesAt" :now="now" tone="dark" />
            <p v-if="gksDaysUntil(lead.closesAt, now) < 1" class="home-gks__note">
              <strong>24 цаг хүрэхгүй үлдлээ.</strong> Одоо холбогдоорой.
            </p>
            <p v-else class="home-gks__note">
              Ердөө <strong class="gks-tnum">{{ gksDaysUntil(lead.closesAt, now) }} хоног</strong> үлдлээ —
              эсээ, орчуулга, нотариатад хугацаа хэрэгтэй. Өнөөдөр эхлээрэй.
            </p>
          </template>
          <p v-else-if="leadPhase === 'UPCOMING'" class="home-gks__big">
            <strong class="gks-tnum">{{ lead.estimated ? '~' : '' }}{{ gksDaysUntil(lead.opensAt, now) }}</strong>
            хоногийн дараа нээгдэнэ — бэлтгэл нь одоо эхэлдэг.
          </p>
          <p v-else class="home-gks__note">{{ lead.afterClose }}</p>

          <div class="home-gks__actions">
            <DsButton variant="accent" icon-right="arrow-right" @click="navigateTo('/gks-scholarship#open-rounds')">
              Элсэлтийн мэдээлэл
            </DsButton>
            <NuxtLink to="/consultation?service=GKS_SCHOLARSHIP" class="home-gks__link">Үнэгүй зөвлөгөө авах</NuxtLink>
          </div>
        </div>
      </div>

      <!-- ── Quick check ──────────────────────────────────────────────── -->
      <form class="home-gks__check" @submit.prevent="navigateTo('/gks-check')">
        <p class="home-gks__label home-gks__label--ink">Би тэнцэх үү? · 10 секунд</p>

        <label class="home-gks__slider">
          <span>
            Нас
            <strong class="gks-tnum">{{ age }}</strong>
          </span>
          <input
            v-model.number="age"
            type="range"
            min="15"
            max="45"
            step="1"
            :style="{ '--fill': `${((age - 15) / 30) * 100}%` }"
            @input="touched = true"
          >
        </label>

        <label class="home-gks__slider">
          <span>
            Сүүлийн голч
            <strong class="gks-tnum">{{ gpa }}%</strong>
          </span>
          <input
            v-model.number="gpa"
            type="range"
            min="50"
            max="100"
            step="1"
            :style="{ '--fill': `${((gpa - 50) / 50) * 100}%` }"
            @input="touched = true"
          >
        </label>

        <div class="home-gks__verdict" :class="[`is-${verdict.toLowerCase()}`, { 'is-idle': !touched }]" aria-live="polite">
          <DsIcon :name="verdict === 'OK' ? 'circle-check' : 'circle-alert'" :size="22" />
          <div>
            <strong>{{ VERDICT_COPY.title }}</strong>
            <p>{{ VERDICT_COPY.text }}</p>
          </div>
        </div>

        <DsButton type="submit" variant="primary" icon-right="arrow-right" block>
          {{ verdict === 'OK' ? 'Боломжоо бүрэн шалгах' : 'Надад тохирох замыг харах' }}
        </DsButton>
      </form>
    </div>
  </section>
</template>

<style scoped>
.home-gks {
  position: relative;
  overflow: hidden;
  padding: var(--sp-9);
  border-radius: var(--radius-5);
  background:
    radial-gradient(circle at 100% 0%, rgba(37, 99, 235, .35), transparent 45%),
    var(--ink-950);
  color: var(--n-000);
}

.home-gks__head { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: end; gap: var(--sp-8); }
.home-gks__kicker { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-3); font-family: var(--font-mono); font-size: var(--fs-caption); font-weight: var(--fw-semibold); letter-spacing: var(--ls-caps); color: var(--brand-300); }
.home-gks__live { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: var(--radius-pill); background: var(--red-600); color: var(--n-000); font-size: 11px; }
.home-gks__live i { width: 6px; height: 6px; border-radius: 50%; background: var(--n-000); animation: home-gks-blink 1.2s steps(2, start) infinite; }
@keyframes home-gks-blink { to { visibility: hidden; } }
.home-gks h2 { margin-top: var(--sp-4); font-size: clamp(32px, 4.6vw, 56px); font-weight: var(--fw-black); line-height: 1.02; letter-spacing: -.035em; color: var(--n-000); }
.home-gks h2 span { color: var(--brand-300); }
.home-gks__lede { max-width: 52ch; margin-top: var(--sp-4); color: var(--n-300); }

.home-gks__benefits { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin: 0; padding: 0; list-style: none; }
.home-gks__benefits li { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border: 1px solid rgba(255, 255, 255, .12); border-radius: var(--radius-3); background: rgba(255, 255, 255, .05); transition: background var(--dur-base), transform var(--dur-base); }
.home-gks__benefits li:hover { background: rgba(255, 255, 255, .1); transform: translateY(-2px); }
.home-gks__benefits :deep(.gks-icon) { grid-row: span 2; color: var(--brand-300); }
.home-gks__benefits strong { font-size: var(--fs-body-lg); font-weight: var(--fw-black); }
.home-gks__benefits span { font-size: var(--fs-micro); color: var(--n-400); }

.home-gks__body { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, 1fr); gap: var(--sp-5); margin-top: var(--sp-8); }

.home-gks__tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: var(--radius-pill); background: rgba(255, 255, 255, .08); }
.home-gks__tabs button { padding: 8px 16px; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--n-300); font: inherit; font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); cursor: pointer; transition: background var(--dur-base), color var(--dur-base); }
.home-gks__tabs button:hover { color: var(--n-000); }
.home-gks__tabs button.is-active { background: var(--n-000); color: var(--ink-950); }

.home-gks__lead { margin-top: var(--sp-4); padding: var(--sp-6); border: 1px solid rgba(255, 255, 255, .12); border-radius: var(--radius-4); background: rgba(255, 255, 255, .04); }
.home-gks__lead.is-open { --phase: #4ade80; }
.home-gks__lead.is-upcoming { --phase: var(--brand-300); }
.home-gks__lead.is-closed { --phase: var(--n-400); }
.home-gks__pill { display: inline-flex; align-items: center; gap: var(--sp-2); padding: 6px 12px; border-radius: var(--radius-pill); background: rgba(255, 255, 255, .08); color: var(--phase); font-size: var(--fs-caption); font-weight: var(--fw-bold); }
.home-gks__pill i { width: 8px; height: 8px; border-radius: 50%; background: var(--phase); }
.is-open .home-gks__pill i { box-shadow: 0 0 0 0 var(--phase); animation: home-gks-ring 1.6s var(--ease-out) infinite; }
@keyframes home-gks-ring { to { box-shadow: 0 0 0 8px transparent; } }
.home-gks__lead h3 { margin-top: var(--sp-4); font-size: var(--fs-h3); font-weight: var(--fw-bold); color: var(--n-000); }
.home-gks__window { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-2); color: var(--n-300); font-size: var(--fs-body-sm); }
.home-gks__label { margin: var(--sp-5) 0 var(--sp-3); font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--ls-caps); color: var(--n-400); }
.home-gks__big { margin-top: var(--sp-5); color: var(--n-300); }
.home-gks__big strong { display: block; font-size: 56px; font-weight: var(--fw-black); line-height: 1; color: var(--n-000); }
.home-gks__note { margin-top: var(--sp-4); font-size: var(--fs-body-sm); color: var(--n-200); }
.home-gks__note strong { color: #fbbf24; }

.home-gks__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-5); margin-top: var(--sp-6); }
.home-gks__link { color: var(--n-300); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 4px; }
.home-gks__link:hover { color: var(--n-000); }

.home-gks__check { display: flex; flex-direction: column; gap: var(--sp-5); padding: var(--sp-6); border-radius: var(--radius-4); background: var(--surface-card); color: var(--text-body); }
.home-gks__label--ink { margin: 0; color: var(--brand-700); font-weight: var(--fw-semibold); }
.home-gks__slider { display: grid; gap: var(--sp-2); }
.home-gks__slider > span { display: flex; justify-content: space-between; align-items: baseline; font-size: var(--fs-body-sm); color: var(--text-muted); }
.home-gks__slider strong { font-size: var(--fs-h3); font-weight: var(--fw-black); color: var(--text-strong); }
.home-gks__slider input {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, var(--brand-600) var(--fill), var(--n-200) var(--fill));
  cursor: pointer;
  appearance: none;
}
.home-gks__slider input::-webkit-slider-thumb { width: 22px; height: 22px; border: 3px solid var(--n-000); border-radius: 50%; background: var(--brand-600); box-shadow: 0 1px 4px rgba(0, 0, 0, .3); appearance: none; }
.home-gks__slider input::-moz-range-thumb { width: 22px; height: 22px; border: 3px solid var(--n-000); border-radius: 50%; background: var(--brand-600); box-shadow: 0 1px 4px rgba(0, 0, 0, .3); }
.home-gks__slider input:focus-visible { outline: 2px solid var(--brand-400); outline-offset: 4px; }

.home-gks__verdict { display: flex; gap: var(--sp-3); padding: var(--sp-4); border-radius: var(--radius-3); transition: background var(--dur-base), opacity var(--dur-base); }
.home-gks__verdict strong { display: block; font-size: var(--fs-body-sm); }
.home-gks__verdict p { margin-top: 2px; font-size: var(--fs-caption); line-height: 1.5; color: var(--text-muted); }
.home-gks__verdict.is-ok { background: var(--green-050); }
.home-gks__verdict.is-ok :deep(.gks-icon), .home-gks__verdict.is-ok strong { color: var(--green-700); }
.home-gks__verdict:not(.is-ok) { background: var(--amber-050); }
.home-gks__verdict:not(.is-ok) :deep(.gks-icon), .home-gks__verdict:not(.is-ok) strong { color: var(--amber-700); }
.home-gks__verdict.is-idle { opacity: .75; }

@media (max-width: 980px) {
  .home-gks__head, .home-gks__body { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .home-gks { padding: var(--sp-6) var(--sp-4); border-radius: var(--radius-4); }
  .home-gks__lead, .home-gks__check { padding: var(--sp-5) var(--sp-4); }
  .home-gks__tabs { display: flex; }
  .home-gks__tabs button { flex: 1; padding: 8px 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .home-gks__live i, .is-open .home-gks__pill i { animation: none; }
  .home-gks__benefits li:hover { transform: none; }
}
</style>
