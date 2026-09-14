<script setup lang="ts">
import type { CaseTab, PortalCaseDetail } from '@gks/shared';

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
    errorMsg.value = apiErrorMessage(err, 'Үйлчилгээг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}
onMounted(load);
provide('caseDetail', { gksCase, reload: load });

const TABS: { key: CaseTab; label: string; to: (i: string) => string; exact?: boolean }[] = [
  { key: 'overview', to: (i: string) => `/app/cases/${i}`, label: 'Явц', exact: true },
  { key: 'contract', to: (i: string) => `/app/cases/${i}/contract`, label: 'Гэрээ' },
  { key: 'payment', to: (i: string) => `/app/cases/${i}/payment`, label: 'Төлбөр' },
  { key: 'documents', to: (i: string) => `/app/cases/${i}/documents`, label: 'Материал' },
  { key: 'application', to: (i: string) => `/app/cases/${i}/application`, label: 'Мэдүүлэг' },
  { key: 'visa', to: (i: string) => `/app/cases/${i}/visa`, label: 'Виз' },
  { key: 'departure', to: (i: string) => `/app/cases/${i}/departure`, label: 'Бэлтгэл' },
];

/**
 * Only the tabs the case has actually opened (`visibleTabs`, computed on the
 * server from the same snapshot as the next step). All seven from day one read
 * as a list of things the client had forgotten to do; "Виз" is not a screen a
 * client who signed their contract this morning can act on.
 */
const tabs = computed(() => {
  const open = gksCase.value?.visibleTabs;
  return open ? TABS.filter((tab) => open.includes(tab.key)) : [];
});

/** The tab the URL is on — the last path segment, or the overview. */
const currentTab = computed<CaseTab>(() => {
  const segment = route.path.replace(/\/+$/, '').split('/').pop();
  return TABS.find((tab) => tab.key === segment)?.key ?? 'overview';
});

// A bookmark, or a link from an older notification, can point at a tab this
// case has not opened — and a hidden tab still renders its page underneath.
// Send those back to the overview rather than leaving the client on a screen
// with no way back into the nav.
watch([gksCase, currentTab], () => {
  const open = gksCase.value?.visibleTabs;
  if (!open || open.includes(currentTab.value)) return;
  void navigateTo(`/app/cases/${id.value}`, { replace: true });
});


useHead({ title: () => (gksCase.value ? gksCase.value.code : 'Миний үйлчилгээ') });
</script>

<template>
  <div class="gks-mycase">
    <NuxtLink to="/app/cases" class="gks-mycase__back">
      <DsIcon name="arrow-left" :size="16" /> Миний үйлчилгээ
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
        <DsBadge :tone="CASE_STAGE_TONE[gksCase.stage]">{{ CASE_STAGE_LABELS[gksCase.stage] }}</DsBadge>
      </header>

      <PortalJourneyStepper :journey="gksCase.journey" :stage="gksCase.stage" />

      <nav class="gks-mycase__tabs">
        <NuxtLink
          v-for="tab in tabs"
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

/* Underline tabs do not fit a phone, and scrolling them sideways hides the
   ones that matter later in the journey. Below 700px they become wrapping
   chips: everything visible, nothing to swipe, and a case showing two tabs
   looks the same as one showing seven. */
@media (max-width: 700px) {
  .gks-mycase__tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
    border-bottom: 0;
    overflow: visible;
  }
  .gks-mycase__tab {
    flex: 1 1 auto;
    padding: var(--sp-2) var(--sp-3);
    border: var(--border-hair) solid var(--line-hairline);
    border-radius: var(--radius-pill);
    background: var(--surface-card);
    font-size: var(--fs-caption);
    text-align: center;
  }
  .gks-mycase__tab--active {
    border-color: var(--brand-600);
    background: var(--brand-600);
    color: var(--text-inverse);
  }
}
</style>
