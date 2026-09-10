<script setup lang="ts">
import type {
  FinanceReport,
  IntakeRiskReport,
  ManagementOverview,
  OutcomesReport,
  PipelineReport,
  ReportPeriodInfo,
  ReportPreset,
  StaffReport,
} from '@gks/shared';
import { useAuthStore } from '~/stores/auth';

/**
 * Удирдлагын тайлан (1M) — §19, rebuilt around the four questions the business
 * actually asks: **хэдэн төгрөг**, **хаана гацаж байна**, **ажилласан уу**,
 * **амжих уу**.
 *
 * Three decisions shape the screen:
 *
 * - **One period control drives everything.** Every report takes the same
 *   window and returns the previous one beside it, so a figure always has
 *   something to be compared against. The exception is the deadline tab, which
 *   is a countdown and belongs to no month.
 * - **Flow and stock are never mixed.** Cards say which they are, in their own
 *   headings, because a receivable is a fact about this minute and revenue is a
 *   fact about a month.
 * - **A tab fetches only when it is opened.** Six reports is a lot of round
 *   trips to a database 115 ms away; the tab the manager is looking at should
 *   not wait on the five they are not.
 */
definePageMeta({ middleware: 'staff', layout: 'admin' });
useHead({ title: 'Тайлан' });

const api = useApi();
const auth = useAuthStore();

/**
 * Finance and staff are money; a consultant gets the rest of the board.
 *
 * Tokens only exist client-side, so the role is unknown during SSR. Waiting for
 * the client before admitting to it keeps the server's tab strip and the
 * browser's identical — otherwise hydration finds two extra tabs and re-labels
 * every one of them.
 */
const roleKnown = ref(false);
onMounted(() => { roleKnown.value = true; });
const canSeeMoney = computed(() => roleKnown.value && auth.user?.role === 'ADMIN');

type TabKey = 'overview' | 'finance' | 'pipeline' | 'outcomes' | 'intake-risk' | 'staff';

const TABS: { key: TabKey; label: string; icon: string; adminOnly?: boolean }[] = [
  { key: 'overview', label: 'Тойм', icon: 'layout-dashboard' },
  { key: 'finance', label: 'Санхүү', icon: 'wallet', adminOnly: true },
  { key: 'pipeline', label: 'Юүлүүр', icon: 'filter' },
  { key: 'outcomes', label: 'Үр дүн', icon: 'award' },
  { key: 'intake-risk', label: 'Хугацаа', icon: 'calendar-clock' },
  { key: 'staff', label: 'Ажилтан', icon: 'users', adminOnly: true },
];

const tabs = computed(() => TABS.filter((item) => !item.adminOnly || canSeeMoney.value));

/**
 * `?tab=` so the dashboard's queue tiles can point at the report that clears
 * them — "элсэлтэд амжихгүй" is a number worth opening, not just reading.
 */
const route = useRoute();
const requested = String(route.query.tab ?? '');
// Only the tabs every staff role can open: a link into a money report the
// caller cannot read would land on a 403 rather than on a report.
const tab = ref<TabKey>(
  TABS.some((item) => item.key === requested && !item.adminOnly) ? (requested as TabKey) : 'overview',
);

// ── The period every report runs on ────────────────────────────────────────

const preset = ref<ReportPreset>('month');
const from = ref('');
const to = ref('');
const stallDays = ref(30);
const horizonDays = ref(120);

const query = computed(() => ({
  preset: preset.value,
  from: from.value || undefined,
  to: to.value || undefined,
  stallDays: stallDays.value,
  horizonDays: horizonDays.value,
}));

// ── The six reports, each loaded when its tab is first opened ──────────────

const overview = ref<ManagementOverview | null>(null);
const finance = ref<FinanceReport | null>(null);
const pipeline = ref<PipelineReport | null>(null);
const outcomes = ref<OutcomesReport | null>(null);
const intakeRisk = ref<IntakeRiskReport | null>(null);
const staff = ref<StaffReport | null>(null);

const pending = ref(false);
const errorMsg = ref<string | null>(null);
const notice = ref<string | null>(null);

/** The window the server resolved — the head prints it, not the preset we sent. */
const period = ref<ReportPeriodInfo | null>(null);

async function load(key: TabKey = tab.value) {
  pending.value = true;
  errorMsg.value = null;
  const search = reportQueryString(query.value);

  try {
    switch (key) {
      case 'overview':
        overview.value = await api.get<ManagementOverview>(`/reports/overview?${search}`);
        period.value = overview.value.period;
        break;
      case 'finance':
        finance.value = await api.get<FinanceReport>(`/reports/finance?${search}`);
        period.value = finance.value.period;
        break;
      case 'pipeline':
        pipeline.value = await api.get<PipelineReport>(`/reports/pipeline?${search}`);
        period.value = pipeline.value.period;
        break;
      case 'outcomes':
        outcomes.value = await api.get<OutcomesReport>(`/reports/outcomes?${search}`);
        period.value = outcomes.value.period;
        break;
      case 'intake-risk':
        // No period: a deadline does not belong to a reporting month.
        intakeRisk.value = await api.get<IntakeRiskReport>(`/reports/intake-risk?${search}`);
        break;
      case 'staff':
        staff.value = await api.get<StaffReport>(`/reports/staff?${search}`);
        period.value = staff.value.period;
        break;
    }
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Тайланг ачаалж чадсангүй';
  } finally {
    pending.value = false;
  }
}

onMounted(() => load());

/** A new tab loads once; a new period reloads whatever is on screen. */
watch(tab, (key) => {
  const loaded = { overview, finance, pipeline, outcomes, 'intake-risk': intakeRisk, staff }[key];
  if (!loaded.value) load(key);
});

watch(
  () => reportQueryString(query.value),
  () => {
    // Everything already fetched is now out of date; drop it and reload the
    // visible tab, so switching back never shows the previous window's figures.
    overview.value = null;
    finance.value = null;
    pipeline.value = null;
    outcomes.value = null;
    intakeRisk.value = null;
    staff.value = null;
    load();
  },
);

// ── Refresh and export ─────────────────────────────────────────────────────

const refreshing = ref(false);

/**
 * Drops the server's short cache and re-reads. The button exists because the
 * figures are memoised for a few minutes: after registering a payment, staff
 * want to see it, not wait for a TTL.
 */
async function refresh() {
  refreshing.value = true;
  try {
    await api.post('/reports/refresh');
    await load();
    notice.value = 'Тоонууд шинэчлэгдлээ.';
    setTimeout(() => (notice.value = null), 4000);
  } catch {
    errorMsg.value = 'Шинэчлэлт амжилтгүй боллоо';
  } finally {
    refreshing.value = false;
  }
}

/**
 * The CSV is fetched rather than linked: the API authenticates with a bearer
 * token held in memory, so a plain `<a href>` would arrive unauthenticated and
 * come back 401.
 */
async function download(report: string) {
  try {
    const search = reportQueryString(query.value, { report });
    const blob = await api.request<Blob>(`/reports/export?${search}`, { responseType: 'blob' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${report}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    errorMsg.value = error instanceof ApiError ? error.message : 'Файл татаж чадсангүй';
  }
}
</script>

<template>
  <div class="gks-page">
    <header class="gks-page__head">
      <div class="gks-page__heading">
        <span class="gks-eyebrow">§19</span>
        <h1 class="gks-page__title">Удирдлагын тайлан</h1>
        <p class="gks-page__hint">
          Тоонууд шууд өгөгдлөөс уншигдана. «Урсгал» гэсэн хэсэг сонгосон хугацаанд юу болсныг,
          «Одоогийн байдал» гэсэн хэсэг яг одоо ямар байгааг харуулна.
        </p>
      </div>
      <DsButton variant="secondary" size="sm" icon-left="refresh-cw" :disabled="refreshing" @click="refresh">
        {{ refreshing ? 'Шинэчилж байна…' : 'Одоо шинэчлэх' }}
      </DsButton>
    </header>

    <ReportsPeriodPicker
      v-model:preset="preset"
      v-model:from="from"
      v-model:to="to"
      :period="period"
      :busy="pending"
    />

    <nav class="gks-tabs" aria-label="Тайлангийн төрөл">
      <button
        v-for="item in tabs"
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

    <p v-if="errorMsg" class="gks-reports__error">{{ errorMsg }}</p>
    <p v-if="notice" class="gks-reports__notice">{{ notice }}</p>
    <p v-if="pending" class="gks-reports__note">Уншиж байна…</p>

    <template v-if="tab === 'overview' && overview">
      <ReportsOverviewPanel :report="overview" :can-see-money="canSeeMoney" />
    </template>

    <template v-else-if="tab === 'finance' && finance">
      <ReportsFinancePanel :report="finance" :download="download" />
    </template>

    <template v-else-if="tab === 'pipeline' && pipeline">
      <ReportsPipelinePanel :report="pipeline" :download="download" />
    </template>

    <template v-else-if="tab === 'outcomes' && outcomes">
      <ReportsOutcomesPanel :report="outcomes" :download="download" />
    </template>

    <template v-else-if="tab === 'intake-risk' && intakeRisk">
      <ReportsIntakeRiskPanel v-model:horizon-days="horizonDays" :report="intakeRisk" :download="download" />
    </template>

    <template v-else-if="tab === 'staff' && staff">
      <ReportsStaffPanel :report="staff" :download="download" />
    </template>

    <p v-if="period && tab !== 'intake-risk'" class="gks-reports__stamp gks-tnum">
      Тооцоолсон: {{ formatNumericDateTimeLocal(period.generatedAt) }}
    </p>
    <p v-else-if="intakeRisk && tab === 'intake-risk'" class="gks-reports__stamp gks-tnum">
      Тооцоолсон: {{ formatNumericDateTimeLocal(intakeRisk.generatedAt) }}
    </p>
  </div>
</template>

<style scoped>
.gks-reports__error { color: var(--danger-fg); font-size: var(--fs-body-sm); }
.gks-reports__notice { color: var(--success-fg); font-size: var(--fs-body-sm); }
.gks-reports__stamp { font-size: var(--fs-micro); color: var(--text-subtle); }
</style>
