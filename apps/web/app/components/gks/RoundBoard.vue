<script setup lang="ts">
import { getAdmissionProgress } from '~/utils/admissions';
import { DEADLINE_SOON_DAYS, DEADLINE_URGENT_DAYS } from '~/utils/labels';
import type { GksRound } from '~/utils/gks-rounds';
import {
  GKS_ROUNDS,
  featuredGksRound,
  getGksRoundPhase,
  gksDaysUntil,
  gksRoundHeadline,
  sortGksRounds,
} from '~/utils/gks-rounds';

/**
 * `/gks-scholarship`'s live board: which GKS round is taking applications right
 * now, and how long is left. The page around it is evergreen; this is the part
 * that knows today's date.
 */
const now = useNow('gks-round-board-clock');

const featured = computed(() => featuredGksRound(GKS_ROUNDS, now.value));
const others = computed(() => sortGksRounds(GKS_ROUNDS, now.value).filter((round) => round.id !== featured.value?.id));

type Tone = 'open' | 'soon' | 'urgent' | 'upcoming' | 'closed';

function toneOf(round: GksRound): Tone {
  const phase = getGksRoundPhase(round, now.value);
  if (phase === 'UPCOMING') return 'upcoming';
  if (phase === 'CLOSED') return 'closed';
  if (!round.countdown) return 'open';
  const days = gksDaysUntil(round.closesAt, now.value);
  if (days <= DEADLINE_URGENT_DAYS) return 'urgent';
  if (days <= DEADLINE_SOON_DAYS) return 'soon';
  return 'open';
}

/** The line under the clock — the push, worded by how close the close is. */
function urgencyLine(round: GksRound): string {
  const days = gksDaysUntil(round.closesAt, now.value);
  if (days < 1) return '24 цаг хүрэхгүй үлдлээ. Одоо холбогдоорой.';
  if (days <= DEADLINE_URGENT_DAYS)
    return `Ердөө ${days} хоног үлдлээ. Эсээ, орчуулга, нотариатад хугацаа хэрэгтэй — өнөөдөр эхлээрэй.`;
  return `${days} хоног үлдлээ. Материалыг эрт бэлдсэн хүн эсээгээ дахин засах цагтай үлддэг.`;
}

const progress = computed(() =>
  featured.value ? getAdmissionProgress(featured.value.opensAt, featured.value.closesAt, now.value) : 0,
);
</script>

<template>
  <section v-if="featured" class="gks-rounds" aria-labelledby="gks-rounds-title">
    <h2 id="gks-rounds-title" class="gks-visually-hidden">Одоо явагдаж буй GKS элсэлт</h2>

    <article class="gks-rounds__featured" :class="`is-${toneOf(featured)}`">
      <div class="gks-rounds__copy">
        <p class="gks-rounds__pill">
          <i aria-hidden="true" />
          {{ gksRoundHeadline(featured, now) }}
        </p>
        <h3>{{ featured.degreeLabel }} · {{ featured.track }}</h3>
        <p class="gks-rounds__summary">{{ featured.summary }}</p>
        <p class="gks-rounds__window">
          <DsIcon name="calendar-clock" :size="16" />
          <span class="gks-tnum">{{ featured.window }}</span>
        </p>
      </div>

      <div class="gks-rounds__timing">
        <template v-if="getGksRoundPhase(featured, now) === 'OPEN' && featured.countdown">
          <p class="gks-rounds__label">Бүртгэл хаагдахад</p>
          <GksCountdown :to="featured.closesAt" :now="now" tone="dark" />
          <div
            class="gks-rounds__progress"
            role="progressbar"
            :aria-valuenow="Math.round(progress)"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-label="Бүртгэлийн хугацааны явц"
          >
            <span :style="{ width: `${progress}%` }" />
          </div>
          <p class="gks-rounds__urgency">{{ urgencyLine(featured) }}</p>
        </template>
        <template v-else-if="getGksRoundPhase(featured, now) === 'UPCOMING'">
          <p class="gks-rounds__label">Нээгдэхэд</p>
          <p class="gks-rounds__days">
            <strong class="gks-tnum">{{ featured.estimated ? '~' : '' }}{{ gksDaysUntil(featured.opensAt, now) }}</strong>
            хоног
          </p>
          <p class="gks-rounds__urgency">Бэлтгэл нь зарлагдсан өдөр биш, одоо эхэлдэг.</p>
        </template>
        <template v-else>
          <p class="gks-rounds__label">Одоогийн шат</p>
          <p class="gks-rounds__urgency">{{ featured.afterClose }}</p>
        </template>

        <div class="gks-rounds__actions">
          <DsButton variant="accent" icon-right="arrow-right" @click="navigateTo(featured.to)">
            {{ getGksRoundPhase(featured, now) === 'OPEN' ? 'Бидэнтэй хамт мэдүүлэх' : 'Бэлтгэлээ эхлүүлэх' }}
          </DsButton>
          <NuxtLink to="/gks-check" class="gks-rounds__secondary">Боломжоо шалгах</NuxtLink>
        </div>
      </div>
    </article>

    <ul class="gks-rounds__list">
      <li v-for="round in others" :key="round.id">
        <NuxtLink :to="round.to" class="gks-rounds__card" :class="`is-${toneOf(round)}`">
          <span class="gks-rounds__pill">
            <i aria-hidden="true" />
            {{ gksRoundHeadline(round, now) }}
          </span>
          <strong>{{ round.degreeLabel }} · {{ round.track }}</strong>
          <span class="gks-rounds__card-window gks-tnum">{{ round.window }}</span>
          <span class="gks-rounds__card-note">
            {{ getGksRoundPhase(round, now) === 'CLOSED' ? round.afterClose : round.summary }}
          </span>
          <DsIcon name="arrow-right" :size="18" class="gks-rounds__card-arrow" />
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.gks-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.gks-rounds { display: grid; gap: var(--sp-4); }

/* Tone → one accent colour, shared by the pill, the clock and the progress bar. */
.is-open { --round-fg: var(--green-600); --round-soft: var(--green-050); }
.is-soon { --round-fg: var(--amber-600); --round-soft: var(--amber-050); }
.is-urgent { --round-fg: var(--red-600); --round-soft: var(--red-050); }
.is-upcoming { --round-fg: var(--brand-500); --round-soft: var(--brand-050); }
.is-closed { --round-fg: var(--n-500); --round-soft: var(--n-050); }

.gks-rounds__featured {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--sp-8);
  padding: var(--sp-8);
  border-radius: var(--radius-4);
  background: var(--ink-950);
  color: var(--n-000);
  box-shadow: var(--shadow-lift);
}
.gks-rounds__featured .gks-rounds__pill { border-color: rgba(255, 255, 255, .16); background: rgba(255, 255, 255, .08); color: var(--n-000); }
.gks-rounds__featured.is-urgent :deep(.gks-cd) { --cd-fg: var(--red-300); }

.gks-rounds__pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: var(--round-soft);
  color: var(--round-fg);
  font-size: var(--fs-caption);
  font-weight: var(--fw-bold);
}
.gks-rounds__pill i {
  position: relative;
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--round-fg);
}
.is-open .gks-rounds__pill i::after,
.is-soon .gks-rounds__pill i::after,
.is-urgent .gks-rounds__pill i::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--round-fg);
  animation: gks-round-pulse 1.6s var(--ease-out) infinite;
}
@keyframes gks-round-pulse {
  from { opacity: .7; transform: scale(1); }
  to { opacity: 0; transform: scale(2.8); }
}

.gks-rounds__copy h3 { margin-top: var(--sp-5); color: var(--n-000); font-size: clamp(24px, 3vw, 34px); font-weight: var(--fw-black); line-height: 1.12; letter-spacing: -.02em; }
.gks-rounds__summary { margin-top: var(--sp-3); color: var(--n-300); }
.gks-rounds__window { display: flex; align-items: center; gap: var(--sp-2); margin-top: var(--sp-5); color: var(--brand-200); font-weight: var(--fw-semibold); }

.gks-rounds__label { margin-bottom: var(--sp-3); font-family: var(--font-mono); font-size: var(--fs-caption); letter-spacing: var(--ls-caps); color: var(--n-400); }
.gks-rounds__days { display: flex; align-items: baseline; gap: var(--sp-2); color: var(--n-300); }
.gks-rounds__days strong { font-size: 64px; font-weight: var(--fw-black); line-height: 1; color: var(--n-000); }
.gks-rounds__progress { height: 6px; margin-top: var(--sp-4); overflow: hidden; border-radius: var(--radius-pill); background: rgba(255, 255, 255, .12); }
.gks-rounds__progress span { display: block; height: 100%; border-radius: inherit; background: var(--round-fg); transition: width var(--dur-slow) var(--ease-out); }
.gks-rounds__urgency { margin-top: var(--sp-4); font-size: var(--fs-body-sm); line-height: 1.5; color: var(--n-200); }
.gks-rounds__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-5); margin-top: var(--sp-6); }
.gks-rounds__secondary { color: var(--n-300); font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 4px; }
.gks-rounds__secondary:hover { color: var(--n-000); }

.gks-rounds__list { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--sp-4); margin: 0; padding: 0; list-style: none; }
.gks-rounds__card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp-2);
  height: 100%;
  padding: var(--sp-5) var(--sp-8) var(--sp-5) var(--sp-5);
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-3);
  background: var(--surface-card);
  color: var(--text-body);
  text-decoration: none;
  transition: border-color var(--dur-base), transform var(--dur-base);
}
.gks-rounds__card:hover { border-color: var(--brand-300); transform: translateY(-2px); }
.gks-rounds__card strong { margin-top: var(--sp-2); font-size: var(--fs-body-lg); color: var(--text-strong); }
.gks-rounds__card-window { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--brand-700); }
.gks-rounds__card-note { font-size: var(--fs-caption); line-height: 1.5; color: var(--text-muted); }
.gks-rounds__card-arrow { position: absolute; right: var(--sp-5); top: 50%; color: var(--brand-600); transform: translateY(-50%); }

@media (max-width: 860px) {
  .gks-rounds__featured { grid-template-columns: 1fr; gap: var(--sp-6); padding: var(--sp-6) var(--sp-5); }
}

@media (prefers-reduced-motion: reduce) {
  .gks-rounds__pill i::after { animation: none; }
  .gks-rounds__card:hover { transform: none; }
}
</style>
