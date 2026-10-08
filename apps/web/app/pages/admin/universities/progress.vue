<script setup lang="ts">
import type { CatalogueCheck, CatalogueProgress } from '@gks/shared';

/**
 * 1A-43 — how complete the catalogue is, one kind of data at a time.
 *
 * The first version put all five checks, the per-level matrix and the staff
 * table on one screen, and nobody could read it. Now each kind of data —
 * intakes, programmes, colleges, tuition, scholarship — is its own tab whose
 * tiles sort the 135 schools into done / partly done / missing, and a click on
 * a tile is the list of schools in it. The overview is one bar per kind.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Мэдээллийн бүрэн байдал · Админ' });

type TabKey = 'overview' | CatalogueCheck | 'staff';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Тойм', icon: 'layout-dashboard' },
  { key: 'intakes', label: 'Элсэлт', icon: 'calendar' },
  { key: 'programs', label: 'Анги', icon: 'book-open' },
  { key: 'faculties', label: 'Танхим', icon: 'building-2' },
  { key: 'tuition', label: 'Төлбөр', icon: 'wallet' },
  { key: 'scholarship', label: 'Тэтгэлэг', icon: 'award' },
  { key: 'staff', label: 'Ажилтнууд', icon: 'users' },
];

const api = useApi();
const route = useRoute();
const router = useRouter();

const requested = String(route.query.tab ?? '');
const tab = ref<TabKey>(TABS.some((item) => item.key === requested) ? (requested as TabKey) : 'overview');
// `?tab=` so a link to "the schools with no tuition" survives a reload.
watch(tab, (key) => router.replace({ query: { ...route.query, tab: key === 'overview' ? undefined : key } }));

const periodDays = ref('30');
const data = ref<CatalogueProgress | null>(null);
const pending = ref(true);
const errorMsg = ref<string | null>(null);

async function load() {
  pending.value = true;
  errorMsg.value = null;
  try {
    data.value = await api.get<CatalogueProgress>('/admin/universities/progress', {
      query: { days: periodDays.value },
    });
  } catch (err) {
    errorMsg.value = apiErrorMessage(err, 'Мэдээллийг ачаалж чадсангүй');
  } finally {
    pending.value = false;
  }
}

onMounted(load);
watch(periodDays, load);
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div>
        <span class="gks-eyebrow">Каталог</span>
        <h1 class="gks-page__title">Мэдээллийн бүрэн байдал</h1>
        <p class="gks-page__hint">Сургууль бүрийн мэдээлэл бүрэн үү, юу нь дутуу вэ.</p>
      </div>
    </header>

    <nav class="gks-tabs" aria-label="Мэдээллийн төрөл">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        class="gks-tab"
        :class="{ 'gks-tab--active': tab === item.key }"
        @click="tab = item.key"
      >
        <DsIcon :name="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </button>
    </nav>

    <DsCard v-if="errorMsg" accent>{{ errorMsg }}</DsCard>

    <div v-else-if="pending && !data" class="gks-skeleton">
      <div v-for="n in 8" :key="n" class="gks-skeleton__row" />
    </div>

    <template v-else-if="data">
      <CatalogueProgressOverviewPanel v-if="tab === 'overview'" :summary="data.summary" @open="tab = $event" />
      <CatalogueProgressIntakesPanel v-else-if="tab === 'intakes'" :rows="data.rows" :summary="data.summary" />
      <CatalogueProgressStaffPanel v-else-if="tab === 'staff'" v-model:period-days="periodDays" :progress="data" />
      <CatalogueProgressCoveragePanel v-else :key="tab" :check="tab" :rows="data.rows" :summary="data.summary" />

      <p class="cp-foot gks-tnum">Тооцоолсон: {{ formatDateTime(data.generatedAt) }}</p>
    </template>
  </div>
</template>

<style scoped>
.cp-foot { font-size: var(--fs-caption); color: var(--text-subtle); }
</style>
