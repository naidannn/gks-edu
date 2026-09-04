<script setup lang="ts">
import type { LeadStage, LeadStats } from '@gks/shared';
import { LEAD_STAGE_ORDER } from '@gks/shared';

/** CRM dashboard — the landing page for staff after login (1B-08). */
definePageMeta({ middleware: 'staff', layout: 'admin' });

const api = useApi();
const stats = ref<LeadStats | null>(null);
const pending = ref(true);
const error = ref(false);

async function load() {
  pending.value = true;
  error.value = false;
  try {
    stats.value = await api.get<LeadStats>('/leads/stats');
  } catch {
    error.value = true;
  } finally {
    pending.value = false;
  }
}
onMounted(load);

type NumericStatKey = 'total' | 'unassigned' | 'mineOpen' | 'newLast7Days';
const TILES: { key: NumericStatKey; label: string; icon: string }[] = [
  { key: 'total', label: 'Нийт сэжим', icon: 'users' },
  { key: 'unassigned', label: 'Хариуцагчгүй', icon: 'user-x' },
  { key: 'mineOpen', label: 'Надад оноогдсон (нээлттэй)', icon: 'user-check' },
  { key: 'newLast7Days', label: 'Сүүлийн 7 хоногт', icon: 'sparkles' },
];

const maxStageCount = computed(() => {
  if (!stats.value) return 0;
  return Math.max(1, ...LEAD_STAGE_ORDER.map((stage) => stats.value!.byStage[stage]));
});
function barWidth(stage: LeadStage): number {
  if (!stats.value) return 0;
  return (stats.value.byStage[stage] / maxStageCount.value) * 100;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('mn-MN', { year: 'numeric', month: 'short', day: 'numeric' });
}
function stageTone(s: LeadStage): 'neutral' | 'info' | 'success' | 'danger' {
  if (s === 'WON') return 'success';
  if (s === 'LOST') return 'danger';
  if (s === 'NEW') return 'neutral';
  return 'info';
}

useHead({ title: 'Хяналтын самбар · CRM' });
</script>

<template>
  <div class="gks-dash">
    <header class="gks-dash__head">
      <span class="gks-eyebrow">CRM</span>
      <h1 class="gks-dash__title">Хяналтын самбар</h1>
    </header>

    <DsCard v-if="error" accent>
      <p>Хяналтын самбарын мэдээллийг ачаалж чадсангүй.</p>
    </DsCard>

    <template v-else>
      <!-- KPI row: single current values, no chart needed (dataviz: stat tiles). -->
      <div class="gks-dash__tiles">
        <DsCard v-for="tile in TILES" :key="tile.key" class="gks-tile">
          <div class="gks-tile__icon"><DsIcon :name="tile.icon" :size="18" /></div>
          <p class="gks-tile__label">{{ tile.label }}</p>
          <p class="gks-tile__value">
            <template v-if="pending && !stats">—</template>
            <template v-else>{{ stats?.[tile.key] ?? 0 }}</template>
          </p>
        </DsCard>
      </div>

      <div class="gks-dash__grid">
        <!-- Funnel: ordered magnitude across the pipeline (dataviz: sequential ramp + status colors). -->
        <DsCard title="Борлуулалтын юүлүүр" class="gks-dash__funnel">
          <div v-if="pending && !stats" class="gks-dash__skeleton" />
          <ol v-else class="gks-stages">
            <li v-for="stage in LEAD_STAGE_ORDER" :key="stage" class="gks-stage-row">
              <span class="gks-stage-row__label">{{ LEAD_STAGE_LABELS[stage] }}</span>
              <span class="gks-stage-row__track">
                <span
                  class="gks-stage-row__fill"
                  :style="{ width: `${barWidth(stage)}%`, background: LEAD_STAGE_BAR_COLOR[stage] }"
                />
              </span>
              <span class="gks-stage-row__count gks-tnum">{{ stats?.byStage[stage] ?? 0 }}</span>
            </li>
          </ol>
        </DsCard>

        <!-- Recent activity -->
        <DsCard title="Сүүлд ирсэн сэжим" class="gks-dash__recent">
          <template #action>
            <NuxtLink to="/admin/leads" class="gks-dash__view-all">Бүгдийг харах</NuxtLink>
          </template>

          <div v-if="pending && !stats" class="gks-dash__skeleton" />
          <ul v-else-if="stats?.recent.length" class="gks-recent">
            <li v-for="lead in stats.recent" :key="lead.id">
              <NuxtLink :to="`/admin/leads/${lead.id}`" class="gks-recent__row">
                <div class="gks-recent__who">
                  <span class="gks-recent__name">{{ lead.lastName }} {{ lead.firstName }}</span>
                  <span class="gks-recent__phone gks-tnum">{{ lead.phone }}</span>
                </div>
                <DsBadge :tone="stageTone(lead.stage)">{{ LEAD_STAGE_LABELS[lead.stage] }}</DsBadge>
                <span class="gks-recent__date gks-tnum">{{ formatDate(lead.createdAt) }}</span>
              </NuxtLink>
            </li>
          </ul>
          <p v-else class="gks-dash__empty">Сэжим алга байна.</p>
        </DsCard>
      </div>

      <DsButton variant="secondary" icon-right="arrow-right" @click="navigateTo('/admin/leads')">
        Бүх сэжим рүү очих
      </DsButton>
    </template>
  </div>
</template>

<style scoped>
.gks-dash { display: flex; flex-direction: column; gap: var(--sp-6); }
.gks-dash__title {
  margin-top: var(--sp-2);
  font-family: var(--font-display);
  font-size: var(--fs-h2);
  font-weight: var(--fw-bold);
}

/* ---- KPI tiles ---- */
.gks-dash__tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-4); }
.gks-tile { display: flex; flex-direction: column; gap: var(--sp-2); }
.gks-tile__icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-2);
  background: var(--surface-selected);
  color: var(--brand-600);
}
.gks-tile__label { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-tile__value {
  font-size: var(--fs-h1);
  font-weight: var(--fw-bold);
  color: var(--text-strong);
  line-height: var(--lh-tight);
}

/* ---- Two-column grid: funnel + recent ---- */
.gks-dash__grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: var(--sp-4); align-items: start; }

.gks-dash__skeleton { height: 200px; background: linear-gradient(var(--n-050), var(--n-100)); border: var(--border-hair) solid var(--line-hairline); }
.gks-dash__empty { color: var(--text-muted); font-size: var(--fs-body-sm); }
.gks-dash__view-all { font-size: var(--fs-caption); color: var(--text-link); text-decoration: none; }
.gks-dash__view-all:hover { color: var(--text-link-hover); }

/* ---- Funnel bars ---- */
.gks-stages { display: flex; flex-direction: column; gap: var(--sp-3); }
.gks-stage-row { display: grid; grid-template-columns: 132px minmax(0, 1fr) 32px; align-items: center; gap: var(--sp-3); }
.gks-stage-row__label { font-size: var(--fs-caption); color: var(--text-muted); }
.gks-stage-row__track {
  height: 16px;
  background: var(--surface-sunken);
  border-radius: 0 var(--radius-1) var(--radius-1) 0;
  overflow: hidden;
}
.gks-stage-row__fill {
  display: block;
  height: 100%;
  border-radius: 0 var(--radius-1) var(--radius-1) 0;
  transition: width var(--dur-slow) var(--ease-standard);
}
.gks-stage-row__count { font-size: var(--fs-caption); font-weight: var(--fw-semibold); color: var(--text-strong); text-align: right; }

/* ---- Recent list ---- */
.gks-recent { display: flex; flex-direction: column; }
.gks-recent__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) 0;
  border-bottom: var(--border-hair) solid var(--line-hairline);
  text-decoration: none;
  color: inherit;
}
.gks-recent li:last-child .gks-recent__row { border-bottom: 0; }
.gks-recent__row:hover .gks-recent__name { color: var(--brand-600); }
.gks-recent__who { display: flex; flex-direction: column; min-width: 0; }
.gks-recent__name { font-size: var(--fs-body-sm); font-weight: var(--fw-semibold); color: var(--text-strong); }
.gks-recent__phone { font-size: var(--fs-caption); color: var(--text-subtle); }
.gks-recent__date { font-size: var(--fs-caption); color: var(--text-subtle); }

@media (max-width: 1100px) {
  .gks-dash__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gks-dash__grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .gks-dash__tiles { grid-template-columns: minmax(0, 1fr); }
  .gks-stage-row { grid-template-columns: 96px minmax(0, 1fr) 28px; }
  .gks-recent__row { grid-template-columns: minmax(0, 1fr) auto; }
  .gks-recent__date { display: none; }
}
</style>
