<script setup lang="ts">
import type { CaseStage, PortalCaseDetail } from '@gks/shared';

/**
 * Shell for one case: stage header, the next step, and the tabs that walk the
 * whole journey from contract to departure (1C-17 … 1F-09).
 *
 * Everything below reads this one `/me/cases/:id` payload, so a tab never
 * disagrees with the header about where the case stands.
 */
definePageMeta({ middleware: 'auth', layout: 'portal' });

const route = useRoute();
const api = useApi();
const id = computed(() => String(route.params.id));

const gksCase = ref<PortalCaseDetail | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  try {
    gksCase.value = await api.get<PortalCaseDetail>(`/me/cases/${id.value}`);
  } catch (err) {
    errorMsg.value = err instanceof Error ? err.message : 'Хэргийг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}
onMounted(load);
provide('caseDetail', { gksCase, reload: load });

const TABS = [
  { to: (i: string) => `/app/cases/${i}`, label: 'Явц', exact: true },
  { to: (i: string) => `/app/cases/${i}/contract`, label: 'Гэрээ' },
  { to: (i: string) => `/app/cases/${i}/payment`, label: 'Төлбөр' },
  { to: (i: string) => `/app/cases/${i}/documents`, label: 'Материал' },
  { to: (i: string) => `/app/cases/${i}/application`, label: 'Мэдүүлэг' },
  { to: (i: string) => `/app/cases/${i}/visa`, label: 'Виз' },
  { to: (i: string) => `/app/cases/${i}/departure`, label: 'Бэлтгэл' },
];

function stageTone(stage: CaseStage): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (stage === 'COMPLETED' || stage === 'DEPARTED') return 'success';
  if (stage === 'CANCELLED' || stage === 'REJECTED') return 'danger';
  if (stage === 'ON_HOLD') return 'warning';
  if (stage === 'CONTRACT_DRAFT') return 'neutral';
  return 'info';
}

useHead({ title: () => (gksCase.value ? gksCase.value.code : 'Миний хэрэг') });
</script>

<template>
  <div class="gks-mycase">
    <NuxtLink to="/app/cases" class="gks-mycase__back">
      <DsIcon name="arrow-left" :size="16" /> Миний хэрэг
    </NuxtLink>

    <DsCard v-if="errorMsg" accent><p>{{ errorMsg }}</p></DsCard>
    <div v-else-if="pending && !gksCase" class="gks-mycase__skeleton" />

    <template v-else-if="gksCase">
      <header class="gks-mycase__head">
        <div>
          <h1 class="gks-mycase__title gks-tnum">{{ gksCase.code }}</h1>
          <p class="gks-mycase__service">
            {{ SERVICE_LABELS[gksCase.serviceType] }}
            <span v-if="gksCase.university"> · {{ universityName(gksCase.university) }}</span>
          </p>
        </div>
        <DsBadge :tone="stageTone(gksCase.stage)">{{ CASE_STAGE_LABELS[gksCase.stage] }}</DsBadge>
      </header>

      <PortalJourneyStepper :journey="gksCase.journey" :stage="gksCase.stage" />

      <nav class="gks-mycase__tabs">
        <NuxtLink
          v-for="tab in TABS"
          :key="tab.label"
          :to="tab.to(id)"
          class="gks-mycase__tab"
          active-class="gks-mycase__tab--active"
          :exact="tab.exact"
        >
          {{ tab.label }}
        </NuxtLink>
      </nav>

      <NuxtPage />
    </template>
  </div>
</template>

<style scoped>
.gks-mycase { display: flex; flex-direction: column; gap: var(--sp-5); }
.gks-mycase__back { display: inline-flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-body-sm); color: var(--text-muted); text-decoration: none; align-self: flex-start; }
.gks-mycase__back:hover { color: var(--brand-600); }
.gks-mycase__skeleton { height: 300px; border-radius: var(--radius-3); background: linear-gradient(var(--n-050), var(--n-100)); }

.gks-mycase__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--sp-4); }
.gks-mycase__title { font-family: var(--font-display); font-size: var(--fs-h2); font-weight: var(--fw-bold); color: var(--text-strong); }
.gks-mycase__service { margin-top: var(--sp-1); color: var(--text-muted); font-size: var(--fs-body-sm); }

.gks-mycase__tabs { display: flex; gap: var(--sp-1); border-bottom: var(--border-hair) solid var(--line-hairline); overflow-x: auto; }
.gks-mycase__tab { padding: var(--sp-3) var(--sp-4); font-size: var(--fs-body-sm); font-weight: var(--fw-medium); color: var(--text-muted); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; }
.gks-mycase__tab:hover { color: var(--text-strong); }
.gks-mycase__tab--active { color: var(--brand-700); border-bottom-color: var(--brand-600); font-weight: var(--fw-semibold); }
</style>
